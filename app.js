/**
 * Космическая эволюция: Протопланетное облако
 * Высокопроизводительная Canvas-анимация (60 FPS) на чистом JS
 */

// Состояния симуляции
const STATE_IDLE = 'idle';           // Вращение протопланетного облака
const STATE_COLLAPSE = 'collapse';   // Сжатие облака к центру
const STATE_EXPLOSION = 'explosion'; // Взрыв сверхновой
const STATE_SPACE = 'space';         // Звездная система в дрейфе

let currentState = STATE_IDLE;

// Инициализация Canvas
const canvas = document.getElementById('spaceCanvas');
const ctx = canvas.getContext('2d');

// Элементы интерфейса
const uiOverlay = document.getElementById('uiOverlay');
const launchButton = document.getElementById('launchButton');
const resetButton = document.getElementById('resetButton');
const cardOverlay = document.getElementById('cardOverlay');
const closeCardButton = document.getElementById('closeCardButton');
const dynamicAge = document.getElementById('dynamicAge');

// Параметры экрана и центра
let width = window.innerWidth;
let height = window.innerHeight;
let centerX = width / 2;
let centerY = height / 2;
let maxRadius = Math.min(width, height) * 0.45;

// Настройка Retina-дисплеев
function resizeCanvas() {
    width = window.innerWidth;
    height = window.innerHeight;
    centerX = width / 2;
    centerY = height / 2;
    maxRadius = Math.min(width, height) * 0.45;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    
    // Если мы уже в финальном состоянии, перегенерируем границы для дрейфующих объектов
    if (currentState === STATE_SPACE) {
        planets.forEach(p => p.keepInBounds());
    }
}

window.addEventListener('resize', resizeCanvas);

// Массивы объектов
let particles = [];
let stars = [];
let planets = [];
let asteroids = [];
let comets = [];

let cardOpeningTime = 0; // Таймер для предотвращения мгновенного закрытия карточки (ghost clicks)

// Параметры взрыва (Supernova)
let shockwave = {
    radius: 0,
    maxRadius: 0,
    alpha: 0,
    active: false
};

let flashAlpha = 0; // Вспышка экрана при взрыве
let collapseTimer = 0;
const COLLAPSE_DURATION = 110; // Кадры сжатия (около 1.8с при 60fps)

// Конфигурация цветовых палитр для космоса (HSL)
const spaceColors = [
    { h: 280, s: 85, l: 60 }, // Фиолетовый
    { h: 320, s: 90, l: 55 }, // Розовый
    { h: 200, s: 95, l: 50 }, // Синий/Голубой
    { h: 25, s: 95, l: 55 },  // Оранжевый
    { h: 45, s: 90, l: 60 },  // Золотой
];

// Вспомогательная функция для генерации случайного HSL цвета
function getRandomSpaceColor() {
    const template = spaceColors[Math.floor(Math.random() * spaceColors.length)];
    // Добавим немного случайности в тон
    const h = (template.h + (Math.random() * 20 - 10) + 360) % 360;
    return `hsl(${h}, ${template.s}%, ${template.l}%)`;
}

/**
 * Класс частицы (для облака и осколков взрыва)
 */
class Particle {
    constructor(isExplosionDebris = false, startX = 0, startY = 0) {
        if (!isExplosionDebris) {
            // Инициализация для протопланетного облака (полярная система координат)
            // Использование Math.pow(Math.random(), 1.6) для более плотного и пушистого центра
            this.r = Math.pow(Math.random(), 1.6) * maxRadius;
            if (this.r < 10) this.r = 10 + Math.random() * 10;
            
            // Двухрукавная спираль с более широким распределением рукавов (для объема)
            const armOffset = Math.random() > 0.5 ? 0 : Math.PI;
            this.angle = (this.r * 0.006) + (Math.random() * 0.7) + armOffset;
            
            // Орбитальная скорость снижена на 10% от 2.5 (коэффициент 2.25)
            this.orbitSpeed = (0.008 + 0.025 * (1 - this.r / maxRadius)) * 2.25;
            
            // Размер частицы
            this.size = Math.random() * 2.2 + 0.4;
            
            // Имитация 3D: наклон диска и вертикальная толщина (z-сдвиг)
            this.tilt = 0.65; // сжатие по оси Y для создания иллюзии наклона диска в 3D
            // Толщина облака больше в центре и угасает к краям
            this.zOffset = (Math.random() - 0.5) * 45 * (1 - this.r / maxRadius);
            
            this.x = centerX + Math.cos(this.angle) * this.r;
            this.y = centerY + (Math.sin(this.angle) * this.r * this.tilt) + this.zOffset;
            
            this.colorIndex = Math.floor(Math.random() * spaceColors.length);
            this.colorTemplate = spaceColors[this.colorIndex];
            this.h = (this.colorTemplate.h + Math.floor(Math.random() * 30 - 15) + 360) % 360;
            this.s = this.colorTemplate.s;
            this.l = this.colorTemplate.l;
            this.alpha = Math.random() * 0.3 + 0.4; // Оптимальная прозрачность для screen-смешивания
            
            // Шум для симуляции хаотичного газа/пыли
            this.noiseX = (Math.random() - 0.5) * 8;
            this.noiseY = (Math.random() - 0.5) * 8;
            
            this.isDebris = false;
        } else {
            // Инициализация для осколков взрыва (декартовы координаты)
            this.x = startX;
            this.y = startY;
            
            const angle = Math.random() * Math.PI * 2;
            const force = Math.random() * 18 + 4; // Скорость разлета
            this.vx = Math.cos(angle) * force;
            this.vy = Math.sin(angle) * force;
            
            this.size = Math.random() * 3.5 + 0.6;
            this.alpha = 1.0;
            
            // Горячие яркие цвета в начале взрыва
            this.h = Math.random() > 0.4 ? (Math.random() * 40 + 15) : 340; // Оранжевый, желтый, красный
            this.s = 100;
            this.l = Math.random() * 30 + 60; // Высокая яркость
            
            this.decay = Math.random() * 0.015 + 0.008; // Скорость угасания
            this.isDebris = true;
        }
    }

    update() {
        if (!this.isDebris) {
            if (currentState === STATE_IDLE) {
                // Вращение в спокойном состоянии
                this.angle += this.orbitSpeed;
                
                // Легкое покачивание радиуса для динамики газового облака
                const radiusPulse = Math.sin(Date.now() * 0.0015 + this.r) * 1.8;
                const currentR = this.r + radiusPulse;
                
                this.x = centerX + Math.cos(this.angle) * currentR + this.noiseX;
                this.y = centerY + (Math.sin(this.angle) * currentR * this.tilt) + this.zOffset + this.noiseY;
                
            } else if (currentState === STATE_COLLAPSE) {
                // Коллапс: быстрое сжатие к центру с ускорением вращения
                const progress = collapseTimer / COLLAPSE_DURATION;
                
                // Ускоряем орбитальную скорость по мере сжатия (сохранение импульса)
                this.angle += this.orbitSpeed * (1 + progress * 15);
                
                // Сжимаем радиус к нулю
                this.r *= 0.95 - (progress * 0.03); 
                
                // Сжимаем вертикальный сдвиг и наклон
                this.zOffset *= 0.95;
                
                // Постепенно уменьшаем хаотичный шум
                this.noiseX *= 0.92;
                this.noiseY *= 0.92;
                
                this.x = centerX + Math.cos(this.angle) * this.r + this.noiseX;
                this.y = centerY + (Math.sin(this.angle) * this.r * (this.tilt + (1 - this.tilt) * progress)) + this.zOffset + this.noiseY;
                
                // Свечение усиливается ближе к центру (повышаем яркость)
                this.l = Math.min(100, this.l + 0.3);
                this.alpha = Math.min(1.0, this.alpha + 0.01);
            }
        } else {
            // Поведение осколка взрыва
            this.x += this.vx;
            this.y += this.vy;
            
            // Сопротивление среды (замедление разлета)
            this.vx *= 0.965;
            this.vy *= 0.965;
            
            // Угасание альфы
            this.alpha -= this.decay;
            
            // "Остывание" цвета (сдвиг от белого/желтого к красному/фиолетовому)
            if (this.h < 300) {
                this.h -= 0.5; // Сдвиг к красному
            }
        }
    }

    draw() {
        if (!this.isDebris) return; // Пыль облака рисуется пакетами в главном цикле для высокой производительности
        
        if (this.alpha <= 0) return;
        
        // Быстрый рендеринг осколка без save/restore и shadowBlur
        ctx.fillStyle = `hsla(${this.h}, ${this.s}%, ${this.l}%, ${this.alpha})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

/**
 * Класс фоновой звезды (создается после взрыва)
 */
class Star {
    constructor(fromCenter = false, fadeIn = false) {
        this.size = Math.random() * 1.5 + 0.3;
        this.maxAlpha = Math.random() * 0.7 + 0.3;
        this.alpha = (fromCenter || fadeIn) ? 0 : this.maxAlpha;
        // Скорость мигания снижена на 20% по фидбеку
        this.twinkleSpeed = (0.005 + Math.random() * 0.015) * 0.8;
        this.twinkleOffset = Math.random() * Math.PI * 2;
        this.fromCenter = fromCenter;
        
        if (fromCenter) {
            // При взрыве звезды вылетают из центра
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * 30;
            this.x = centerX + Math.cos(angle) * dist;
            this.y = centerY + Math.sin(angle) * dist;
            
            // Гораздо большая сила разлета, чтобы разлететься по всему 2к экрану
            const force = Math.random() * 16 + 6;
            this.vx = Math.cos(angle) * force;
            this.vy = Math.sin(angle) * force;
        } else {
            // Обычная инициализация по всему экрану
            this.x = Math.random() * width;
            this.y = Math.random() * height;
            this.vx = (Math.random() - 0.5) * 0.05; // Минимальный дрейф
            this.vy = (Math.random() - 0.5) * 0.05;
        }
        
        // Цвет звезд: в основном белые, немного голубых и желтых оттенков
        const rand = Math.random();
        if (rand < 0.7) {
            this.color = '255, 255, 255';
        } else if (rand < 0.9) {
            this.color = '173, 216, 230'; // Голубоватый
        } else {
            this.color = '255, 240, 200'; // Кремовый/Желтоватый
        }
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        
        // Слабое торможение для вылетающих звезд, чтобы они успевали пролететь большие расстояния
        if (this.fromCenter) {
            this.vx *= 0.992;
            this.vy *= 0.992;
        } else {
            this.vx *= 0.985;
            this.vy *= 0.985;
        }
        
        // Бесконечный дрейф с минимальной фоновой скоростью
        if (Math.abs(this.vx) < 0.02) this.vx = (Math.random() - 0.5) * 0.03;
        if (Math.abs(this.vy) < 0.02) this.vy = (Math.random() - 0.5) * 0.03;

        // Телепортация звезд, вышедших за границы экрана
        if (this.x < 0) this.x = width;
        if (this.x > width) this.x = 0;
        if (this.y < 0) this.y = height;
        if (this.y > height) this.y = 0;
        
        // Эффект плавного появления после взрыва
        if (this.alpha < this.maxAlpha) {
            this.alpha += 0.008; // Чуть медленнее и плавнее проявление
        }
    }

    draw() {
        // Синусоидальное мерцание
        const currentAlpha = Math.max(0.1, this.alpha * (0.4 + 0.6 * Math.sin(Date.now() * this.twinkleSpeed + this.twinkleOffset)));
        
        ctx.save();
        ctx.fillStyle = `rgba(${this.color}, ${currentAlpha})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

/**
 * Класс планеты (рождается после взрыва)
 */
class Planet {
    constructor() {
        // Рождаются в центре (точке взрыва)
        this.x = centerX;
        this.y = centerY;
        this.r = 0; // Расстояние от центра (полярные координаты)
        
        this.angle = Math.random() * Math.PI * 2;
        // Скорость выброса (радиальный импульс)
        this.radialSpeed = (Math.random() * 2.0 + 1.5) * 0.8; 
        
        // Задержка взрыва для хаотичного выброса
        this.explosionDelay = Math.random() * 25;
        
        // Целевая круговая орбита (ближе к центру, внутри пояса астероидов)
        this.orbitRadius = maxRadius * (0.15 + Math.random() * 0.42);
        // Скорость орбиты по закону Кеплера (быстрее у центра) снижена на 20%
        this.orbitSpeed = (0.0012 + 0.0028 * (1 - this.orbitRadius / maxRadius)) * 0.8;
        
        // Размеры от мелких (3px) до крупных (28px)
        this.size = Math.random() * 22 + 4;
        this.currentSize = 0.1; // Растут от нуля при взрыве
        
        // Случайные цвета для создания 3D текстуры с помощью градиентов
        this.color1 = getRandomSpaceColor();
        this.color2 = getRandomSpaceColor();
        // Вектор освещения (для тени на планете)
        this.shadowAngle = Math.random() * Math.PI * 2;
        
        // Наличие колец (25% вероятность для планет среднего и крупного размера)
        this.hasRings = this.size > 10 && Math.random() < 0.25;
        if (this.hasRings) {
            this.ringColor = this.color2;
            this.ringWidth = this.size * (Math.random() * 0.8 + 1.4);
            this.ringHeight = this.size * 0.25;
            this.ringTilt = Math.random() * 0.4 - 0.2; // Наклон колец в радианах
        }
        
        // Наличие спутников (мелкие точки, вращающиеся вокруг)
        this.moons = [];
        if (this.size > 15 && Math.random() < 0.4) {
            const moonCount = Math.floor(Math.random() * 2) + 1;
            for (let i = 0; i < moonCount; i++) {
                this.moons.push({
                    orbitRadius: this.size * (1.6 + Math.random() * 0.8),
                    angle: Math.random() * Math.PI * 2,
                    speed: (0.01 + Math.random() * 0.02) * (Math.random() > 0.5 ? 1 : -1),
                    size: Math.random() * 2 + 1,
                    color: '#dddddd'
                });
            }
        }
        this.hasQuestionMark = false;
    }

    keepInBounds() {
        // Метод пуст, так как планеты привязаны к эллиптическим орбитам
    }

    update() {
        if (currentState === STATE_EXPLOSION) {
            // Во время взрыва: ждем своей очереди в центре
            if (this.explosionDelay > 0) {
                this.explosionDelay--;
                this.r = 0;
                this.x = centerX;
                this.y = centerY;
            } else {
                // Радиальный разлет из центра
                this.r += this.radialSpeed;
                this.radialSpeed *= 0.94; // Затухание импульса взрыва
                
                // Вращение планет начинается во время разлета (закручивание спирали)
                this.angle += this.orbitSpeed * 0.5;
                
                // Плавный переход к целевой орбите (исключает резкий рывок в конце)
                this.r += (this.orbitRadius - this.r) * 0.03;
                
                this.x = centerX + Math.cos(this.angle) * this.r;
                this.y = centerY + Math.sin(this.angle) * this.r * 0.65;
            }
        } else if (currentState === STATE_SPACE) {
            // В режиме космоса: планета движется по стабильной эллиптической 3D орбите
            this.angle += this.orbitSpeed;
            // Плавное притяжение/вход на орбиту продолжается
            this.r += (this.orbitRadius - this.r) * 0.05;
            
            this.x = centerX + Math.cos(this.angle) * this.r;
            this.y = centerY + Math.sin(this.angle) * this.r * 0.65;
        }
        
        // Постепенное увеличение размера до целевого
        if (this.currentSize < this.size) {
            this.currentSize += (this.size - this.currentSize) * 0.08;
        }
        
        // Медленное вращение тени (создает эффект осевого вращения планеты)
        this.shadowAngle += 0.001;

        // Обновление спутников
        this.moons.forEach(moon => {
            moon.angle += moon.speed;
        });
    }

    draw() {
        const scale = 1.0 + 0.22 * Math.sin(this.angle);
        const radius = this.currentSize * scale;
        if (radius <= 0.2) return;

        ctx.save();
        
        // 1. Отрисовка задней части колец (если есть), чтобы планета перекрывала переднюю часть
        if (this.hasRings) {
            this.drawRings(true, scale);
        }

        // 2. Отрисовка спутников на задней полуорбите
        this.moons.forEach(moon => {
            const cos = Math.cos(moon.angle);
            if (cos < 0) { // Спутник сзади
                this.drawMoon(moon, scale);
            }
        });

        // 3. Отрисовка тела планеты с 3D-градиентом
        const grad = ctx.createRadialGradient(
            this.x - radius * 0.35, this.y - radius * 0.35, radius * 0.1,
            this.x, this.y, radius
        );
        grad.addColorStop(0, this.color1);
        grad.addColorStop(0.5, this.color2);
        grad.addColorStop(1, '#000000'); // Затемнение по краям для объема

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(this.x, this.y, radius, 0, Math.PI * 2);
        ctx.fill();

        // 4. Реалистичная тень (эффект фазы освещения)
        const shadowGrad = ctx.createRadialGradient(
            this.x, this.y, radius * 0.6,
            this.x, this.y, radius
        );
        shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
        shadowGrad.addColorStop(0.8, 'rgba(0, 0, 0, 0.45)');
        shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0.95)');
        
        ctx.fillStyle = shadowGrad;
        ctx.beginPath();
        ctx.arc(this.x, this.y, radius, 0, Math.PI * 2);
        ctx.fill();

        // 5. Отрисовка спутников на передней полуорбите
        this.moons.forEach(moon => {
            const cos = Math.cos(moon.angle);
            if (cos >= 0) { // Спутник спереди
                this.drawMoon(moon, scale);
            }
        });

        // 6. Отрисовка передней части колец
        if (this.hasRings) {
            this.drawRings(false, scale);
        }

        // 7. Отрисовка интерактивного знака визитки над планетой (в форме выноски/speech bubble)
        if (this.hasQuestionMark && currentState === STATE_SPACE) {
            const bounce = Math.sin(Date.now() * 0.004) * 4;
            const qx = this.x;
            const qy = this.y - radius - 23 + bounce; // Чуть выше над планетой
            
            const w = 28;
            const h = 22;
            const r = 6; // Скругление углов
            
            ctx.save();
            // Свечение неоновой выноски
            ctx.shadowBlur = 12;
            ctx.shadowColor = '#ff7700';
            ctx.fillStyle = 'rgba(15, 15, 23, 0.95)';
            ctx.strokeStyle = '#ff7700';
            ctx.lineWidth = 1.8;
            
            ctx.beginPath();
            // Рисуем скругленный прямоугольник выноски
            ctx.moveTo(qx - w/2 + r, qy - h/2);
            ctx.lineTo(qx + w/2 - r, qy - h/2);
            ctx.quadraticCurveTo(qx + w/2, qy - h/2, qx + w/2, qy - h/2 + r);
            ctx.lineTo(qx + w/2, qy + h/2 - r);
            ctx.quadraticCurveTo(qx + w/2, qy + h/2, qx + w/2 - r, qy + h/2);
            
            // Маленький указатель (стрелочка вниз на планету)
            ctx.lineTo(qx + 5, qy + h/2);
            ctx.lineTo(qx, qy + h/2 + 6);
            ctx.lineTo(qx - 5, qy + h/2);
            
            ctx.lineTo(qx - w/2 + r, qy + h/2);
            ctx.quadraticCurveTo(qx - w/2, qy + h/2, qx - w/2, qy + h/2 - r);
            ctx.lineTo(qx - w/2, qy - h/2 + r);
            ctx.quadraticCurveTo(qx - w/2, qy - h/2, qx - w/2 + r, qy - h/2);
            
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            
            // Текст "!" по центру выноски
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 14px "Orbitron", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('!', qx, qy - 1); // Сдвиг на 1px вверх
            ctx.restore();
        }

        ctx.restore();
    }

    drawMoon(moon, scale) {
        // Проекция 3D орбиты на 2D экран с учетом перспективы
        const scaledOrbit = moon.orbitRadius * scale;
        const scaledSize = moon.size * scale;
        const mx = this.x + Math.cos(moon.angle) * scaledOrbit;
        const my = this.y + Math.sin(moon.angle) * (scaledOrbit * 0.35); // Сплющенный эллипс орбиты
        
        ctx.save();
        ctx.fillStyle = moon.color;
        ctx.shadowBlur = 4 * scale;
        ctx.shadowColor = moon.color;
        ctx.beginPath();
        ctx.arc(mx, my, scaledSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    drawRings(isBack, scale) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.ringTilt);

        const scaledWidth = this.ringWidth * scale;
        const scaledHeight = this.ringHeight * scale;

        // Клиппинг для разделения передней и задней части колец
        ctx.beginPath();
        if (isBack) {
            // Задняя часть: рисуем только верхнюю половину колец
            ctx.rect(-scaledWidth * 1.5, -scaledWidth * 1.5, scaledWidth * 3, scaledWidth * 1.5);
        } else {
            // Передняя часть: рисуем только нижнюю половину колец
            ctx.rect(-scaledWidth * 1.5, 0, scaledWidth * 3, scaledWidth * 1.5);
        }
        ctx.clip();

        // Создаем градиент для колец (светлые и темные полосы)
        const ringGrad = ctx.createLinearGradient(-scaledWidth, 0, scaledWidth, 0);
        ringGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
        ringGrad.addColorStop(0.3, this.ringColor);
        ringGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.4)');
        ringGrad.addColorStop(0.7, this.ringColor);
        ringGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.strokeStyle = ringGrad;
        ctx.lineWidth = scaledHeight;
        
        // Рисуем эллипс колец
        ctx.beginPath();
        ctx.ellipse(0, 0, scaledWidth, scaledHeight * 1.5, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
    }
}

/**
 * Класс астероида (создает случайный пояс астероидов после взрыва)
 */
class Asteroid {
    constructor() {
        // Рождаются в центре (точке взрыва)
        this.x = centerX;
        this.y = centerY;
        this.r = 0; // Расстояние от центра (полярные координаты)
        
        const angle = Math.random() * Math.PI * 2;
        // Случайная сила взрыва с большим разбросом для хаотичности
        this.radialSpeed = Math.random() * 9 + 2; 
        
        // Задержка взрыва: астероиды вылетают неравномерными пачками/волнами (до 45 кадров)
        this.explosionDelay = Math.random() * 45;
        
        // Концентрируем астероиды во внешнем узком кольцевом поясе (0.68 - 0.85 от maxRadius)
        this.orbitRadius = maxRadius * (0.68 + Math.random() * 0.17);
        this.angle = angle; // Начинает орбиту с угла разлета
        
        // Движение строго в одном направлении (в ту же сторону, что и вращение облака)
        this.orbitSpeed = 0.0006 + Math.random() * 0.0016; 
        
        this.size = Math.random() * 1.8 + 0.5; // Мелкие угловатые тела
        
        // Цвет: оттенки серого, коричневого, темно-золотого (астероиды каменные/металлические)
        const gray = Math.floor(Math.random() * 55 + 75); // 75 - 130
        this.color = `rgba(${gray}, ${gray - Math.floor(Math.random() * 12)}, ${gray - Math.floor(Math.random() * 22)}, ${Math.random() * 0.35 + 0.45})`;
        
        this.tilt = 0.65; // Наклон пояса астероидов (согласован с облаком)
        this.zOffset = (Math.random() - 0.5) * 12; // Более тонкий пояс по высоте для упорядоченности
    }

    update() {
        if (currentState === STATE_EXPLOSION) {
            // Во время взрыва: ждем своей задержки в центре, затем вылетаем
            if (this.explosionDelay > 0) {
                this.explosionDelay--;
                this.r = 0;
                this.x = centerX;
                this.y = centerY;
            } else {
                // Радиальный разлет из центра
                this.r += this.radialSpeed;
                this.radialSpeed *= 0.95; // Затухание импульса взрыва
                
                // Начинаем закручиваться во время взрыва
                this.angle += this.orbitSpeed * 0.5;
                
                // Плавный переход к целевой орбите (исключает резкий рывок)
                this.r += (this.orbitRadius - this.r) * 0.03;
                
                this.x = centerX + Math.cos(this.angle) * this.r;
                this.y = centerY + (Math.sin(this.angle) * this.r * this.tilt) + this.zOffset;
            }
        } else if (currentState === STATE_SPACE) {
            // Вращение по орбите
            this.angle += this.orbitSpeed;
            // Плавное притяжение/вход на орбиту продолжается
            this.r += (this.orbitRadius - this.r) * 0.04;
            
            this.x = centerX + Math.cos(this.angle) * this.r;
            this.y = centerY + (Math.sin(this.angle) * this.r * this.tilt) + this.zOffset;
        }
    }

    draw() {
        const scale = 1.0 + 0.22 * Math.sin(this.angle);
        const scaledSize = this.size * scale;
        
        ctx.save();
        ctx.fillStyle = this.color;
        
        // Рисуем слегка неровный астероид с учетом масштаба перспективы
        ctx.beginPath();
        const points = 5;
        for (let i = 0; i < points; i++) {
            const angle = (i / points) * Math.PI * 2;
            // Случайный радиус для угловатости
            const r = scaledSize * (0.8 + Math.random() * 0.4);
            const px = this.x + Math.cos(angle) * r;
            const py = this.y + Math.sin(angle) * r;
            if (i === 0) {
                ctx.moveTo(px, py);
            } else {
                ctx.lineTo(px, py);
            }
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
}

/**
 * Класс кометы (случайно пролетает по экрану с хвостом и 3D-перспективой)
 */
class Comet {
    constructor() {
        // Задаем глубину/перспективу
        // scale от 0.2 (вдали) до 1.8 (вблизи)
        this.scale = 0.2 + Math.pow(Math.random(), 2) * 1.6; // Больше далеких, меньше близких
        
        this.size = (Math.random() * 2.2 + 0.8); // Базовый размер ядра
        this.alpha = Math.random() * 0.3 + 0.7; // Прозрачность ядра
        
        // В зависимости от масштаба задаем скорость (близкие летят быстро, далекие - медленно)
        const speed = (4 + Math.random() * 7) * this.scale;
        
        // Направление полета: по диагонали сверху-слева вниз-вправо
        const angle = 0.1 * Math.PI + Math.random() * 0.35 * Math.PI;
        
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        
        // Точка старта: за пределами экрана
        if (Math.random() > 0.5) {
            this.x = -150;
            this.y = Math.random() * height * 0.6 - 100;
        } else {
            this.x = Math.random() * width * 0.6 - 150;
            this.y = -150;
        }
        
        this.tailHistory = [];
        this.maxTailLength = Math.floor((12 + Math.random() * 20) * this.scale); // Длина хвоста
        this.isDead = false;
        
        // Цвет хвоста (нежно-голубой, зеленовато-бирюзовый или золотистый)
        const rand = Math.random();
        if (rand < 0.55) {
            this.color = '160, 220, 255'; // Голубой
        } else if (rand < 0.8) {
            this.color = '145, 255, 215'; // Бирюзовый
        } else {
            this.color = '255, 225, 175'; // Золотистый
        }
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        
        // Запись истории хвоста для плавности
        this.tailHistory.push({ x: this.x, y: this.y });
        if (this.tailHistory.length > this.maxTailLength) {
            this.tailHistory.shift();
        }
        
        // Проверка выхода за экран с запасом на длину хвоста
        const margin = 200;
        if (this.x > width + margin || this.y > height + margin) {
            this.isDead = true;
        }
    }

    draw() {
        const len = this.tailHistory.length;
        if (len < 2) return;
        
        ctx.save();
        
        // Отрисовка хвоста сегментами с угасанием толщины и альфы
        for (let i = 0; i < len - 1; i++) {
            const p1 = this.tailHistory[i];
            const p2 = this.tailHistory[i + 1];
            const progress = i / len; // от 0 (хвост) до 1 (голова)
            
            ctx.strokeStyle = `rgba(${this.color}, ${progress * 0.28 * this.alpha * Math.min(1, this.scale)})`;
            ctx.lineWidth = this.size * this.scale * progress * 1.5;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        }
        
        // Отрисовка ядра кометы (светящаяся точка с градиентным ореолом)
        const grad = ctx.createRadialGradient(
            this.x, this.y, 0,
            this.x, this.y, this.size * this.scale * 1.4
        );
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.3, `rgba(${this.color}, ${this.alpha})`);
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * this.scale * 1.4, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
}

/**
 * Первичная генерация протопланетного облака
 */
function initProtoplanetaryCloud() {
    particles = [];
    stars = [];
    planets = [];
    asteroids = [];
    comets = [];
    
    // Генерируем 2500 частиц для объемного и плотного облака
    const particleCount = 2500;
    for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle(false));
    }
}

/**
 * Логика запуска коллапса облака
 */
function launchCollapse() {
    if (currentState !== STATE_IDLE) return;
    
    currentState = STATE_COLLAPSE;
    collapseTimer = 0;
    
    // Плавно скрываем текстовый интерфейс
    uiOverlay.classList.add('hidden');
    
    // Полностью убираем оверлей из DOM через 1.5 секунды (после окончания анимации ухода),
    // чтобы он физически не перекрывал клики и ховеры мыши на холсте Canvas
    setTimeout(() => {
        if (currentState !== STATE_IDLE) {
            uiOverlay.style.display = 'none';
        }
    }, 1500);
}

/**
 * Логика взрыва (Supernova)
 */
function triggerExplosion() {
    currentState = STATE_EXPLOSION;
    
    // Вспышка экрана на максимум
    flashAlpha = 1.0;
    
    // 1. Создаем радиальную ударную волну (shockwave)
    shockwave.radius = 10;
    shockwave.maxRadius = Math.max(width, height) * 0.8;
    shockwave.alpha = 1.0;
    shockwave.active = true;
    
    // 2. Переводим все выжившие частицы облака в статус осколков взрыва
    const debrisCount = Math.min(particles.length, 500); // Ограничим количество осколков для производительности
    particles = [];
    for (let i = 0; i < debrisCount; i++) {
        particles.push(new Particle(true, centerX, centerY));
    }
    
    // 3. Создаем планеты из центра взрыва (от 4 до 9 случайных планет)
    const planetCount = Math.floor(Math.random() * 6) + 4;
    for (let i = 0; i < planetCount; i++) {
        planets.push(new Planet());
    }
    // Назначаем одной случайной планете маркер визитки
    if (planets.length > 0) {
        const randomIndex = Math.floor(Math.random() * planets.length);
        planets[randomIndex].hasQuestionMark = true;
    }
    
    // Создаем случайный пояс астероидов (от 160 до 240 астероидов)
    const asteroidCount = Math.floor(Math.random() * 80) + 160;
    for (let i = 0; i < asteroidCount; i++) {
        asteroids.push(new Asteroid());
    }
    
    // 4. Создаем фоновые звезды, разлетающиеся из центра взрыва
    // 120 звезд летят из центра на высокой скорости
    for (let i = 0; i < 120; i++) {
        stars.push(new Star(true));
    }
    
    // 250 звезд плавно проявляются по всей площади экрана (для больших 2к мониторов)
    for (let i = 0; i < 250; i++) {
        stars.push(new Star(false, true)); // false - не из центра, true - плавно проявить
    }
}

/**
 * Переход к финальному дрейфу звездной системы
 */
function finalizeSpace() {
    currentState = STATE_SPACE;
    
    // Показываем кнопку сброса/пересоздания системы
    resetButton.classList.remove('hidden');
}

/**
 * Полный сброс симуляции к начальному состоянию
 */
function resetSimulation() {
    // Скрываем кнопку и карточку
    resetButton.classList.add('hidden');
    cardOverlay.classList.add('hidden');
    
    // Переводим в IDLE
    currentState = STATE_IDLE;
    
    // Возвращаем оверлей в DOM
    uiOverlay.style.display = 'flex';
    // Даем браузеру перерисовать display перед запуском анимации появления
    setTimeout(() => {
        uiOverlay.classList.remove('hidden');
    }, 20);
    
    // Переинициализируем облако
    initProtoplanetaryCloud();
}

// Привязка обработчиков событий
launchButton.addEventListener('click', (e) => {
    e.stopPropagation();
    launchCollapse();
});

// Обработка клика по канвасу отключена (запуск только по кнопке LAUNCH!)

resetButton.addEventListener('click', (e) => {
    e.stopPropagation();
    resetSimulation();
});

// Поддержка запуска по кнопке Enter/Space с клавиатуры
launchButton.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        launchCollapse();
    }
});

/**
 * Динамический расчет возраста от даты рождения 24.09.1989
 */
function calculateAge() {
    const birthDate = new Date(1989, 8, 24); // Месяц 0-индексирован (8 = сентябрь)
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
}

// Обработка клика по окну (для открытия карточки визитки)
window.addEventListener('click', (e) => {
    if (currentState !== STATE_SPACE) return;
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const infoPlanet = planets.find(p => p.hasQuestionMark);
    if (infoPlanet) {
        const scale = 1.0 + 0.22 * Math.sin(infoPlanet.angle);
        const radius = infoPlanet.currentSize * scale;
        const qx = infoPlanet.x;
        const bounce = Math.sin(Date.now() * 0.004) * 4;
        const qy = infoPlanet.y - radius - 23 + bounce; // Должно соответствовать координатам отрисовки выноски
        
        const distToQ = Math.hypot(mouseX - qx, mouseY - qy);
        const distToPlanet = Math.hypot(mouseX - infoPlanet.x, mouseY - infoPlanet.y);
        
        // Клик срабатывает и по выноске (26px), и по самой планете (radius + 15px) для удобства
        if (distToQ < 26 || distToPlanet < radius + 15) {
            cardOpeningTime = Date.now(); // Фиксируем время открытия
            dynamicAge.textContent = calculateAge();
            cardOverlay.classList.remove('hidden');
        }
    }
});

// Отслеживание наведения мыши для смены курсора на pointer над "!" или самой планетой
window.addEventListener('mousemove', (e) => {
    if (currentState !== STATE_SPACE) {
        canvas.style.cursor = 'default';
        return;
    }
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const infoPlanet = planets.find(p => p.hasQuestionMark);
    if (infoPlanet) {
        const scale = 1.0 + 0.22 * Math.sin(infoPlanet.angle);
        const radius = infoPlanet.currentSize * scale;
        const qx = infoPlanet.x;
        const bounce = Math.sin(Date.now() * 0.004) * 4;
        const qy = infoPlanet.y - radius - 23 + bounce;
        
        const distToQ = Math.hypot(mouseX - qx, mouseY - qy);
        const distToPlanet = Math.hypot(mouseX - infoPlanet.x, mouseY - infoPlanet.y);
        
        if (distToQ < 26 || distToPlanet < radius + 15) {
            canvas.style.cursor = 'pointer';
            return;
        }
    }
    canvas.style.cursor = 'default';
});

// Закрытие карточки по крестику
closeCardButton.addEventListener('click', () => {
    cardOverlay.classList.add('hidden');
});

// Закрытие карточки по клику вне контента (с защитой от мгновенного фантомного клика)
cardOverlay.addEventListener('click', (e) => {
    if (e.target === cardOverlay && Date.now() - cardOpeningTime > 250) {
        cardOverlay.classList.add('hidden');
    }
});

/**
 * Главный цикл отрисовки и симуляции
 */
function animate() {
    // Очистка Canvas
    // Используем легкую полупрозрачную очистку для эффекта хвостов (motion blur) у быстро движущихся частиц
    if (currentState === STATE_EXPLOSION) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.15)'; // Хвосты при взрыве
    } else {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'; // Мягкие хвосты при вращении облака
    }
    ctx.fillRect(0, 0, width, height);

    // Отрисовка фоновых звезд (только в финальной фазе)
    if (currentState === STATE_SPACE || currentState === STATE_EXPLOSION) {
        stars.forEach(star => {
            star.update();
            star.draw();
        });
    }

    // Обработка и отрисовка частиц (облако или осколки взрыва)
    if (particles.length > 0) {
        ctx.globalCompositeOperation = 'screen';
        
        // Разделяем частицы на фоновое облако (пыль) и осколки взрыва (debris)
        const cloudParticles = [];
        const debrisParticles = [];
        
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.update();
            
            if (p.isDebris) {
                if (p.alpha <= 0) {
                    particles.splice(i, 1);
                } else {
                    debrisParticles.push(p);
                }
            } else {
                cloudParticles.push(p);
            }
        }
        
        // 1. Отрисовка облака пакетами (Batch Rendering) по 5 цветовым группам
        // Это снижает количество вызовов fill() с 2500 до 5, убирая любые лаги
        if (cloudParticles.length > 0) {
            const groups = Array.from({ length: spaceColors.length }, () => []);
            
            cloudParticles.forEach(p => {
                groups[p.colorIndex].push(p);
            });
            
            for (let g = 0; g < spaceColors.length; g++) {
                const group = groups[g];
                if (group.length === 0) continue;
                
                const template = spaceColors[g];
                const repAlpha = group[0].alpha;
                const repL = group[0].l;
                
                ctx.fillStyle = `hsla(${template.h}, ${template.s}%, ${repL}%, ${repAlpha})`;
                ctx.beginPath();
                
                group.forEach(p => {
                    ctx.moveTo(p.x + p.size, p.y);
                    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                });
                
                ctx.fill();
            }
        }
        
        // 2. Индивидуальная отрисовка осколков взрыва (их мало и они быстро гаснут)
        debrisParticles.forEach(p => {
            p.draw();
        });
        
        // Возвращаем нормальный режим наложения
        ctx.globalCompositeOperation = 'source-over';
    }

    // Логика фазы COLLAPSE (сжатие)
    if (currentState === STATE_COLLAPSE) {
        collapseTimer++;
        if (collapseTimer >= COLLAPSE_DURATION) {
            triggerExplosion();
        }
    }

    // Обработка взрыва и ударной волны
    if (currentState === STATE_EXPLOSION) {
        // Рисуем ударную волну (shockwave)
        if (shockwave.active) {
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            
            const shockGrad = ctx.createRadialGradient(
                centerX, centerY, shockwave.radius * 0.7,
                centerX, centerY, shockwave.radius
            );
            shockGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
            shockGrad.addColorStop(0.7, 'rgba(255, 170, 0, 0.4)');
            shockGrad.addColorStop(0.9, 'rgba(255, 230, 200, 0.8)');
            shockGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            
            ctx.fillStyle = shockGrad;
            ctx.beginPath();
            ctx.arc(centerX, centerY, shockwave.radius, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.restore();
            
            // Расширение волны
            shockwave.radius += 24;
            // Плавное затухание
            if (shockwave.radius > shockwave.maxRadius) {
                shockwave.active = false;
            }
        }
        
        // Вспышка экрана при взрыве (эффект засвета)
        if (flashAlpha > 0) {
            ctx.fillStyle = `rgba(255, 245, 230, ${flashAlpha})`;
            ctx.fillRect(0, 0, width, height);
            flashAlpha -= 0.04; // Быстрое угасание вспышки
        }

        // Если все осколки взрыва угасли, переходим в космический дрейф
        if (particles.length === 0 && flashAlpha <= 0) {
            finalizeSpace();
        }
    }

    // Отрисовка планет, астероидов и комет (существуют в фазе SPACE)
    if (currentState === STATE_SPACE || currentState === STATE_EXPLOSION) {
        // 1. Случайный спавн комет в фазе SPACE
        if (currentState === STATE_SPACE && Math.random() < 0.002) {
            comets.push(new Comet());
        }

        // 2. Обновляем физику всех объектов
        asteroids.forEach(asteroid => asteroid.update());
        planets.forEach(planet => planet.update());
        
        for (let i = comets.length - 1; i >= 0; i--) {
            const comet = comets[i];
            comet.update();
            if (comet.isDead) {
                comets.splice(i, 1);
            }
        }
        
        // 3. Объединяем их в единую очередь рендеринга для Z-сортировки по глубине (координате Y)
        const renderQueue = [...asteroids, ...planets, ...comets];
        // Сортируем: объекты с меньшим Y (на заднем плане) рисуются первыми
        renderQueue.sort((a, b) => a.y - b.y);
        
        // 4. Отрисовываем отсортированную очередь (комета пролетает сквозь планеты на разной высоте!)
        renderQueue.forEach(obj => {
            obj.draw();
        });
    }

    requestAnimationFrame(animate);
}

// Запуск приложения
resizeCanvas();
initProtoplanetaryCloud();
animate();
