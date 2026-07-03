/**
 * Космическая эволюция: Протопланетное облако
 * Высокопроизводительная Canvas-анимация (60 FPS) на чистом JS
 */

// Состояния симуляции
const STATE_IDLE = 'idle';           // Вращение протопланетного облака
const STATE_COLLAPSE = 'collapse';   // Сжатие облака к центру
const STATE_EXPLOSION = 'explosion'; // Взрыв сверхновой
const STATE_SPACE = 'space';         // Звездная система в дрейфе
// Предварительная загрузка аватаров для исключения лагов при открытии карточек
const preloadedAvatars = {};
['avatar.jpg', 'ichi.png', 'mystery.png'].forEach(src => {
    const img = new Image();
    img.src = src;
    preloadedAvatars[src] = img;
});

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
const cardAvatar = document.getElementById('cardAvatar');
const cardName = document.getElementById('cardName');
const cardSubtitle = document.getElementById('cardSubtitle');
const emailRow = document.getElementById('emailRow');
const tgRow = document.getElementById('tgRow');

// Параметры экрана и центра
let width = window.innerWidth;
let height = window.innerHeight;
let centerX = width / 2;
let centerY = height / 2;
let maxRadius = (width < height) ? (width * 0.48) : (Math.min(width, height) * 0.45); // Более крупный радиус на вертикальных экранах
let screenScale = Math.min(1.0, Math.max(0.82, width / 1300)); // Глобальный масштаб увеличен до 0.82 для крупных планет на мобильных
let systemTilt = width < height ? 0.82 : 0.65; // Угол наклона системы: раскрываем орбиты по вертикали на смартфонах

// Настройка Retina-дисплеев
function resizeCanvas() {
    width = window.innerWidth;
    height = window.innerHeight;
    centerX = width / 2;
    centerY = height / 2;
    maxRadius = (width < height) ? (width * 0.48) : (Math.min(width, height) * 0.45);
    screenScale = Math.min(1.0, Math.max(0.82, width / 1300));
    systemTilt = width < height ? 0.82 : 0.65;

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
let spaceships = [];
let solarProminences = [];

let currentTimestamp = Date.now();
const cloudGroups = Array.from({ length: 5 }, () => []);

let cardOpeningTime = 0; // Таймер для предотвращения мгновенного закрытия карточки (ghost clicks)

let isDoubleStar = false;

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
            this.tilt = systemTilt; // динамический наклон диска в зависимости от пропорций экрана
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
                const radiusPulse = Math.sin(currentTimestamp * 0.0015 + this.r) * 1.8;
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
        
        // Быстрый рендеринг осколка без save/restore, arc() и shadowBlur
        ctx.fillStyle = `hsla(${this.h}, ${this.s}%, ${this.l}%, ${this.alpha})`;
        ctx.fillRect(this.x - this.size, this.y - this.size, this.size * 2, this.size * 2);
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
        const currentAlpha = Math.max(0.1, this.alpha * (0.4 + 0.6 * Math.sin(currentTimestamp * this.twinkleSpeed + this.twinkleOffset)));
        
        ctx.fillStyle = `rgba(${this.color}, ${currentAlpha})`;
        ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
    }
}

/**
 * Класс планеты (рождается после взрыва)
 */
class Planet {
    constructor(orbitRadius = null) {
        this.x = centerX;
        this.y = centerY;
        this.r = 0;
        this.angle = Math.random() * Math.PI * 2;
        this.radialSpeed = (Math.random() * 2.0 + 1.5) * 0.8; 
        this.explosionDelay = Math.random() * 25;
        
        if (orbitRadius !== null) {
            this.orbitRadius = orbitRadius;
        } else {
            const minOrbit = 0.35 + (1 - screenScale) * 0.05;
            const orbitRange = 0.55 + (1 - screenScale) * 0.05;
            this.orbitRadius = maxRadius * (minOrbit + Math.random() * orbitRange);
        }
        
        this.baseSize = Math.random() * 16 + 10;
        this.size = this.baseSize * screenScale;
        this.currentSize = 0.1;
        
        const sizeFactor = 1.0 + (this.baseSize - 10) / 30;
        const baseSpeed = 0.020;
        this.orbitSpeed = (baseSpeed / Math.sqrt(this.orbitRadius)) / sizeFactor;
        
        // Случайные цвета для создания 3D текстуры с помощью градиентов
        this.color1 = getRandomSpaceColor();
        this.color2 = getRandomSpaceColor();
        // Вектор освещения (для тени на планете)
        this.shadowAngle = Math.random() * Math.PI * 2;
        
        // Наличие колец (25% вероятность для планет среднего и крупного размера)
        this.hasRings = this.size > 10 * screenScale && Math.random() < 0.25;
        if (this.hasRings) {
            this.ringColor = this.color2;
            this.ringWidth = this.size * (Math.random() * 0.8 + 1.4);
            this.ringHeight = this.size * 0.25;
            this.ringTilt = Math.random() * 0.4 - 0.2; // Наклон колец в радианах
        }
        
        // Наличие спутников (мелкие точки, вращающиеся вокруг)
        this.moons = [];
        if (this.size > 15 * screenScale && Math.random() < 0.4) {
            const moonCount = Math.floor(Math.random() * 2) + 1;
            for (let i = 0; i < moonCount; i++) {
                this.moons.push({
                    orbitRadius: this.size * (1.5 + Math.random() * 0.6),
                    angle: Math.random() * Math.PI * 2,
                    speed: (0.01 + Math.random() * 0.02) * (Math.random() > 0.5 ? 1 : -1),
                    baseSize: Math.random() * 2 + 1,
                    color: '#dddddd'
                });
            }
        }
        this.hasAntonMark = false;
        this.hasIchiMark = false;
        this.hasMysteryMark = false;
        this.isSpaceStation = false;
        this.stationType = Math.floor(Math.random() * 2);
        this.stationAngle = Math.random() * Math.PI * 2;
        this.stationRotSpeed = (Math.random() * 0.01 + 0.005) * (Math.random() > 0.5 ? 1 : -1);
    }

    keepInBounds() {
        // Метод пуст, так как планеты привязаны к эллиптическим орбитам
    }

    update() {
        // Динамический пересчет размера планет и колец при ресайзе
        this.size = this.baseSize * screenScale;
        if (this.hasRings) {
            this.ringWidth = this.size * 1.8;
            this.ringHeight = this.size * 0.25;
        }

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
                this.y = centerY + Math.sin(this.angle) * this.r * systemTilt;
            }
        } else if (currentState === STATE_SPACE) {
            // В режиме космоса: планета движется по стабильной эллиптической 3D орбите
            this.angle += this.orbitSpeed;
            // Плавное притяжение/вход на орбиту продолжается
            this.r += (this.orbitRadius - this.r) * 0.05;
            
            this.x = centerX + Math.cos(this.angle) * this.r;
            this.y = centerY + Math.sin(this.angle) * this.r * systemTilt;
        }
        
        // Постепенное увеличение размера до целевого
        if (this.currentSize < this.size) {
            this.currentSize += (this.size - this.currentSize) * 0.08;
        }
        
        // Медленное вращение тени (создает эффект осевого вращения планеты)
        this.shadowAngle += 0.001;

        if (this.isSpaceStation) {
            this.stationAngle += this.stationRotSpeed;
        }

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
        
        if (this.isSpaceStation) {
            this.moons.forEach(moon => {
                const cos = Math.cos(moon.angle);
                if (cos < 0) {
                    this.drawMoon(moon, scale);
                }
            });

            this.drawSpaceStation(scale);

            this.moons.forEach(moon => {
                const cos = Math.cos(moon.angle);
                if (cos >= 0) {
                    this.drawMoon(moon, scale);
                }
            });
        } else {
            if (this.hasRings) {
                this.drawRings(true, scale);
            }
            this.moons.forEach(moon => {
                const cos = Math.cos(moon.angle);
                if (cos < 0) {
                    this.drawMoon(moon, scale);
                }
            });
            const grad = ctx.createRadialGradient(
                this.x - radius * 0.35, this.y - radius * 0.35, radius * 0.1,
                this.x, this.y, radius
            );
            grad.addColorStop(0, this.color1);
            grad.addColorStop(0.5, this.color2);
            grad.addColorStop(1, '#000000');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(this.x, this.y, radius, 0, Math.PI * 2);
            ctx.fill();
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
            this.moons.forEach(moon => {
                const cos = Math.cos(moon.angle);
                if (cos >= 0) {
                    this.drawMoon(moon, scale);
                }
            });
            if (this.hasRings) {
                this.drawRings(false, scale);
            }
        }

        // 7. Отрисовка интерактивного знака визитки над планетой (в форме выноски/speech bubble)
        const hasMark = this.hasAntonMark || this.hasIchiMark || this.hasMysteryMark;
        if (hasMark && currentState === STATE_SPACE) {
            const bounce = Math.sin(currentTimestamp * 0.004) * 4;
            const qx = this.x;
            const qy = this.y - radius - (23 * screenScale) + bounce; // Чуть выше над планетой
            
            const w = 28 * screenScale;
            const h = 22 * screenScale;
            const r = 6 * screenScale; // Скругление углов
            const pointerHeight = 6 * screenScale;
            
            // Цвет и символы:
            // Антон: зеленый (#00ff66) и "!"
            // Ichi: желтый (#ffff00) и "?"
            // Mystery: красный (#ff3333) и "!?"
            let glowColor = '#ff3333';
            let char = '!?';
            if (this.hasAntonMark) {
                glowColor = '#00ff66';
                char = '!';
            } else if (this.hasIchiMark) {
                glowColor = '#ff7700';
                char = '❤️';
            } else if (this.hasMysteryMark) {
                glowColor = '#ff3333';
                char = '!?';
            }
            
            // Расширяем выноску по ширине для "!?"
            const finalW = char.length > 1 ? w * 1.35 : w;
            
            ctx.save();
            // Свечение неоновой выноски
            ctx.shadowBlur = 12 * screenScale;
            ctx.shadowColor = glowColor;
            ctx.fillStyle = 'rgba(15, 15, 23, 0.95)';
            ctx.strokeStyle = glowColor;
            ctx.lineWidth = 1.8 * screenScale;
            
            ctx.beginPath();
            // Рисуем скругленный прямоугольник выноски
            ctx.moveTo(qx - finalW/2 + r, qy - h/2);
            ctx.lineTo(qx + finalW/2 - r, qy - h/2);
            ctx.quadraticCurveTo(qx + finalW/2, qy - h/2, qx + finalW/2, qy - h/2 + r);
            ctx.lineTo(qx + finalW/2, qy + h/2 - r);
            ctx.quadraticCurveTo(qx + finalW/2, qy + h/2, qx + finalW/2 - r, qy + h/2);
            
            // Маленький указатель (стрелочка вниз на планету)
            ctx.lineTo(qx + (5 * screenScale), qy + h/2);
            ctx.lineTo(qx, qy + h/2 + pointerHeight);
            ctx.lineTo(qx - (5 * screenScale), qy + h/2);
            
            ctx.lineTo(qx - finalW/2 + r, qy + h/2);
            ctx.quadraticCurveTo(qx - finalW/2, qy + h/2, qx - finalW/2, qy + h/2 - r);
            ctx.lineTo(qx - finalW/2, qy - h/2 + r);
            ctx.quadraticCurveTo(qx - finalW/2, qy - h/2, qx - finalW/2 + r, qy - h/2);
            
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            
            // Текст символа по центру выноски (шрифт чуть компактнее для двух символов)
            ctx.fillStyle = '#ffffff';
            const baseFontSize = char.length > 1 ? 12 : 14;
            const fontSize = Math.round(baseFontSize * screenScale);
            ctx.font = `bold ${fontSize}px "Orbitron", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(char, qx, qy - (1 * screenScale)); 
            ctx.restore();
        }

        ctx.restore();
    }

    drawMoon(moon, scale) {
        // Проекция 3D орбиты на 2D экран с учетом перспективы
        const scaledOrbit = moon.orbitRadius * scale;
        const scaledSize = moon.baseSize * screenScale * scale;
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
        // Высота кольца масштабируется в зависимости от угла наклона системы (systemTilt)
        const scaledHeight = this.ringHeight * scale * (systemTilt / 0.65);

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

    drawSpaceStation(scale) {
        const radius = this.currentSize * scale;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.stationAngle);
        
        if (this.stationType === 0) {
            ctx.strokeStyle = '#8899a6';
            ctx.lineWidth = 2 * screenScale * scale;
            ctx.fillStyle = '#1b2228';
            ctx.beginPath();
            ctx.arc(0, 0, radius * 0.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(-radius * 0.9, 0);
            ctx.lineTo(radius * 0.9, 0);
            ctx.moveTo(0, -radius * 0.9);
            ctx.lineTo(0, radius * 0.9);
            ctx.stroke();
            ctx.fillStyle = '#00aaff';
            ctx.strokeStyle = '#005588';
            ctx.lineWidth = 1 * screenScale * scale;
            const panelW = radius * 0.35;
            const panelH = radius * 0.18;
            ctx.fillRect(-radius * 0.9 - panelW/2, -panelH/2, panelW, panelH);
            ctx.strokeRect(-radius * 0.9 - panelW/2, -panelH/2, panelW, panelH);
            ctx.fillRect(radius * 0.9 - panelW/2, -panelH/2, panelW, panelH);
            ctx.strokeRect(radius * 0.9 - panelW/2, -panelH/2, panelW, panelH);
            ctx.strokeStyle = '#8899a6';
            ctx.beginPath();
            ctx.moveTo(0, -radius * 0.9);
            ctx.lineTo(0, -radius * 1.15);
            ctx.stroke();
            const isLightOn = Math.sin(currentTimestamp * 0.008) > 0;
            if (isLightOn) {
                ctx.fillStyle = '#ff3333';
                ctx.shadowBlur = 6 * screenScale;
                ctx.shadowColor = '#ff3333';
                ctx.beginPath();
                ctx.arc(0, -radius * 1.15, 2.5 * screenScale * scale, 0, Math.PI * 2);
                ctx.fill();
            }
        } else {
            ctx.strokeStyle = '#8899a6';
            ctx.lineWidth = 1.8 * screenScale * scale;
            ctx.beginPath();
            for (let i = 0; i < 3; i++) {
                const a = (i * Math.PI * 2) / 3;
                const xPos = Math.cos(a) * radius * 0.7;
                const yPos = Math.sin(a) * radius * 0.7;
                if (i === 0) ctx.moveTo(xPos, yPos);
                else ctx.lineTo(xPos, yPos);
            }
            ctx.closePath();
            ctx.stroke();
            ctx.beginPath();
            for (let i = 0; i < 3; i++) {
                const a = (i * Math.PI * 2) / 3;
                ctx.moveTo(0, 0);
                ctx.lineTo(Math.cos(a) * radius * 0.7, Math.sin(a) * radius * 0.7);
            }
            ctx.stroke();
            ctx.fillStyle = '#151b20';
            ctx.beginPath();
            ctx.arc(0, 0, radius * 0.25, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            for (let i = 0; i < 3; i++) {
                const a = (i * Math.PI * 2) / 3;
                const xPos = Math.cos(a) * radius * 0.7;
                const yPos = Math.sin(a) * radius * 0.7;
                ctx.fillStyle = '#1b2228';
                ctx.beginPath();
                ctx.arc(xPos, yPos, radius * 0.2, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.save();
                ctx.translate(xPos, yPos);
                ctx.rotate(a);
                ctx.fillStyle = '#00ffff';
                ctx.strokeStyle = '#005588';
                ctx.lineWidth = 1 * screenScale * scale;
                ctx.fillRect(radius * 0.15, -radius * 0.05, radius * 0.18, radius * 0.1);
                ctx.strokeRect(radius * 0.15, -radius * 0.05, radius * 0.18, radius * 0.1);
                ctx.restore();
            }
            const isLightOn = Math.sin(currentTimestamp * 0.01) > 0;
            if (isLightOn) {
                ctx.fillStyle = '#00ff66';
                ctx.shadowBlur = 8 * screenScale;
                ctx.shadowColor = '#00ff66';
                ctx.beginPath();
                ctx.arc(0, 0, 3 * screenScale * scale, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
    }
}

class Spaceship {
    constructor(fromPlanet = null) {
        if (fromPlanet) {
            this.fromPlanet = fromPlanet;
        } else {
            this.fromPlanet = planets[Math.floor(Math.random() * planets.length)];
        }
        this.selectNextDestination();
        this.x = this.fromPlanet.x;
        this.y = this.fromPlanet.y;
        this.progress = 0;
        this.speed = 0.001 + Math.random() * 0.0015;
        this.curveFactor = (Math.random() - 0.5) * 120 * screenScale; 
        const colors = ['#00ffff', '#ff5e00', '#00ff66', '#ff00ff', '#ffff00'];
        this.color = colors[Math.floor(Math.random() * colors.length)];
        this.trailHistory = [];
        this.maxTrailLength = 35;
        this.state = 'flying';
        this.orbitAngle = Math.random() * Math.PI * 2;
        this.orbitSpeed = 0.04 + Math.random() * 0.04;
        this.orbitRadius = this.fromPlanet.currentSize * 1.3;
        this.orbitTimer = 0;
        this.maxOrbitTime = 180 + Math.floor(Math.random() * 180);
    }
    selectNextDestination() {
        if (Math.random() < 0.20 && planets.length > 0) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.max(width, height) * 1.5;
            this.toPlanet = {
                x: centerX + Math.cos(angle) * dist,
                y: centerY + Math.sin(angle) * dist,
                currentSize: 0,
                angle: 0
            };
            this.speed = 0.0015 + Math.random() * 0.0015;
            return;
        }
        if (planets.length <= 1) {
            this.toPlanet = this.fromPlanet;
            return;
        }
        let dest = planets[Math.floor(Math.random() * planets.length)];
        while (dest === this.fromPlanet) {
            dest = planets[Math.floor(Math.random() * planets.length)];
        }
        this.toPlanet = dest;
    }
    update() {
        if (this.state === 'flying') {
            this.progress += this.speed;
            if (this.progress >= 1) {
                this.progress = 1;
                if (this.toPlanet.currentSize === 0) {
                    this.fromPlanet = planets[Math.floor(Math.random() * planets.length)];
                    this.selectNextDestination();
                    this.x = this.fromPlanet.x;
                    this.y = this.fromPlanet.y;
                    this.progress = 0;
                    this.state = 'flying';
                    this.trailHistory = [];
                    this.curveFactor = (Math.random() - 0.5) * 120 * screenScale;
                    this.speed = 0.001 + Math.random() * 0.0015;
                    return;
                }
                this.state = 'orbiting';
                this.orbitTimer = 0;
                this.orbitAngle = Math.atan2(this.y - this.toPlanet.y, this.x - this.toPlanet.x);
                this.orbitRadius = this.toPlanet.currentSize * 1.3;
            }
            const startX = this.fromPlanet.x;
            const startY = this.fromPlanet.y;
            const endX = this.toPlanet.x;
            const endY = this.toPlanet.y;
            const lerpX = startX + (endX - startX) * this.progress;
            const lerpY = startY + (endY - startY) * this.progress;
            const dx = endX - startX;
            const dy = endY - startY;
            const len = Math.hypot(dx, dy);
            if (len > 0) {
                const nx = -dy / len;
                const ny = dx / len;
                const offset = Math.sin(this.progress * Math.PI) * this.curveFactor;
                this.x = lerpX + nx * offset;
                this.y = lerpY + ny * offset * systemTilt;
            } else {
                this.x = lerpX;
                this.y = lerpY;
            }
        } else if (this.state === 'orbiting') {
            this.orbitAngle += this.orbitSpeed;
            this.orbitRadius = this.toPlanet.currentSize * 1.3;
            const scale = 1.0 + 0.22 * Math.sin(this.toPlanet.angle);
            const r = this.orbitRadius * scale;
            this.x = this.toPlanet.x + Math.cos(this.orbitAngle) * r;
            this.y = this.toPlanet.y + Math.sin(this.orbitAngle) * r * systemTilt;
            this.orbitTimer++;
            if (this.orbitTimer >= this.maxOrbitTime) {
                this.fromPlanet = this.toPlanet;
                this.selectNextDestination();
                this.progress = 0;
                this.state = 'flying';
                this.curveFactor = (Math.random() - 0.5) * 120 * screenScale;
                this.speed = 0.001 + Math.random() * 0.0015;
            }
        }
        this.trailHistory.push({ x: this.x, y: this.y });
        if (this.trailHistory.length > this.maxTrailLength) {
            this.trailHistory.shift();
        }
    }
    draw() {
        const len = this.trailHistory.length;
        if (len < 2) return;
        ctx.save();
        for (let i = 0; i < len - 1; i++) {
            const p1 = this.trailHistory[i];
            const p2 = this.trailHistory[i + 1];
            const progress = i / len;
            ctx.strokeStyle = this.color;
            ctx.globalAlpha = progress * 0.4;
            ctx.lineWidth = 1.5 * screenScale * progress;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        }
        ctx.globalAlpha = 1.0;
        let angle = 0;
        if (len >= 2) {
            const pLast = this.trailHistory[len - 1];
            const pPrev = this.trailHistory[len - 2];
            angle = Math.atan2(pLast.y - pPrev.y, pLast.x - pPrev.x);
        }
        ctx.translate(this.x, this.y);
        ctx.rotate(angle);
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 8 * screenScale;
        ctx.shadowColor = this.color;
        ctx.beginPath();
        const w = 5 * screenScale;
        const h = 3 * screenScale;
        ctx.moveTo(w, 0);
        ctx.lineTo(-w, -h);
        ctx.lineTo(-w * 0.5, 0);
        ctx.lineTo(-w, h);
        ctx.closePath();
        ctx.fill();
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
        
        // Концентрируем астероиды во внешнем узком кольцевом поясе (0.98 - 1.18 от maxRadius)
        this.orbitRadius = maxRadius * (0.98 + Math.random() * 0.20);
        this.angle = angle; // Начинает орбиту с угла разлета
        
        // Движение строго в одном направлении (в ту же сторону, что и вращение облака)
        this.orbitSpeed = 0.0006 + Math.random() * 0.0016; 
        
        this.baseSize = Math.random() * 1.8 + 0.5;
        this.size = this.baseSize * screenScale; // Мелкие угловатые тела
        
        // Цвет: оттенки серого, коричневого, темно-золотого (астероиды каменные/металлические)
        const gray = Math.floor(Math.random() * 55 + 75); // 75 - 130
        this.color = `rgba(${gray}, ${gray - Math.floor(Math.random() * 12)}, ${gray - Math.floor(Math.random() * 22)}, ${Math.random() * 0.35 + 0.45})`;
        
        this.tilt = systemTilt; // Наклон пояса астероидов (согласован с облаком/планетами)
        this.zOffset = (Math.random() - 0.5) * 12; // Более тонкий пояс по высоте для упорядоченности
        
        // Преинициализируем смещения формы один раз для ускорения отрисовки
        this.shapePoints = 5;
        this.shapeOffsets = [];
        for (let i = 0; i < this.shapePoints; i++) {
            this.shapeOffsets.push(0.8 + Math.random() * 0.4);
        }
    }

    update() {
        // Динамический пересчет размера астероидов при ресайзе
        this.size = this.baseSize * screenScale;

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
        
        ctx.fillStyle = this.color;
        
        if (scaledSize < 2.0) {
            // Для мелких астероидов рисуем легкий и быстрый квадрат вместо круга
            ctx.fillRect(this.x - scaledSize, this.y - scaledSize, scaledSize * 2, scaledSize * 2);
        } else {
            // Для более крупных рисуем многоугольник по кэшированным смещениям
            ctx.beginPath();
            for (let i = 0; i < this.shapePoints; i++) {
                const angle = (i / this.shapePoints) * Math.PI * 2;
                const r = scaledSize * this.shapeOffsets[i];
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
        }
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
        
        this.baseSize = Math.random() * 2.2 + 0.8; // Базовый размер ядра
        this.size = this.baseSize * screenScale;
        this.alpha = Math.random() * 0.3 + 0.7; // Прозрачность ядра
        
        // В зависимости от масштаба задаем скорость (близкие летят быстро, далекие - медленно)
        const speed = (4 + Math.random() * 7) * this.scale * screenScale;
        
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
        // Динамический пересчет размера комет при ресайзе
        this.size = this.baseSize * screenScale;

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
    spaceships = [];
    solarProminences = [];
    isDoubleStar = false;
    
    // 2500 частиц для десктопа и 1100 для гладкой работы на мобильных устройствах
    const particleCount = (window.innerWidth < 600) ? 1100 : 2500;
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
    const isMobile = width < 600;
    currentState = STATE_EXPLOSION;
    isDoubleStar = Math.random() < 0.5;
    
    // Вспышка экрана на максимум
    flashAlpha = 1.0;
    
    // 1. Создаем радиальную ударную волну (shockwave)
    shockwave.radius = 10;
    shockwave.maxRadius = Math.max(width, height) * 0.8;
    shockwave.alpha = 1.0;
    shockwave.active = true;
    
    // 2. Переводим все выжившие частицы облака в статус осколков взрыва
    // Ограничиваем до 220 на мобильных для экономии ресурсов
    const debrisCount = Math.min(particles.length, isMobile ? 220 : 500);
    particles = [];
    for (let i = 0; i < debrisCount; i++) {
        particles.push(new Particle(true, centerX, centerY));
    }
    
    const planetCount = isMobile ? (Math.floor(Math.random() * 3) + 3) : (Math.floor(Math.random() * 6) + 4);
    const minOrbit = 0.35 + (1 - screenScale) * 0.05;
    const orbitRange = 0.55 + (1 - screenScale) * 0.05;
    for (let i = 0; i < planetCount; i++) {
        const t = i / (planetCount - 1 || 1);
        const orbitFactor = minOrbit + t * orbitRange + (Math.random() * 0.06 - 0.03);
        const radius = maxRadius * orbitFactor;
        planets.push(new Planet(radius));
    }
    // Назначаем трем разным планетам маркеры визиток Антона, Ichi и Mystery
    if (planets.length >= 3) {
        const indices = [];
        while (indices.length < 3) {
            const idx = Math.floor(Math.random() * planets.length);
            if (!indices.includes(idx)) indices.push(idx);
        }
        planets[indices[0]].hasAntonMark = true;
        planets[indices[1]].hasIchiMark = true;
        planets[indices[2]].hasMysteryMark = true;
    } else if (planets.length === 2) {
        planets[0].hasAntonMark = true;
        planets[1].hasIchiMark = true;
    } else if (planets.length === 1) {
        planets[0].hasAntonMark = true;
    }

    const stationCount = Math.floor(Math.random() * 3);
    const stationIndices = [];
    while (stationIndices.length < Math.min(stationCount, planets.length)) {
        const idx = Math.floor(Math.random() * planets.length);
        if (!stationIndices.includes(idx)) {
            stationIndices.push(idx);
        }
    }
    stationIndices.forEach((idx, i) => {
        planets[idx].isSpaceStation = true;
        if (stationIndices.length === 2) {
            planets[idx].stationType = i;
        } else {
            planets[idx].stationType = Math.floor(Math.random() * 2);
        }
    });
    
    // Создаем случайный пояс астероидов (меньше на мобильных устройствах для производительности)
    const asteroidCount = isMobile ? (Math.floor(Math.random() * 30) + 50) : (Math.floor(Math.random() * 80) + 160);
    for (let i = 0; i < asteroidCount; i++) {
        asteroids.push(new Asteroid());
    }
    
    // 4. Создаем фоновые звезды, разлетающиеся из центра взрыва
    // 120 звезд летят из центра на высокой скорости (60 на мобильных)
    const activeStarsCount = isMobile ? 60 : 120;
    for (let i = 0; i < activeStarsCount; i++) {
        stars.push(new Star(true));
    }
    
    // 250 звезд плавно проявляются по всей площади экрана (100 на мобильных)
    const backgroundStarsCount = isMobile ? 100 : 250;
    for (let i = 0; i < backgroundStarsCount; i++) {
        stars.push(new Star(false, true)); // false - не из центра, true - плавно проявить
    }

    spaceships = [];
    const shipCount = planets.length >= 3 ? (isMobile ? 3 : 5) : 2;
    for (let i = 0; i < shipCount; i++) {
        spaceships.push(new Spaceship());
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

/**
 * Динамический расчет возраста Ichi от 02.04.2019
 */
function calculateIchiAge() {
    const birthDate = new Date(2019, 3, 2); // 2 апреля (месяц 3)
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
    
    // Ищем, по какой планете кликнули (Антона, Ichi или Mystery)
    const clickedPlanet = planets.find(p => {
        if (!p.hasAntonMark && !p.hasIchiMark && !p.hasMysteryMark) return false;
        
        const scale = 1.0 + 0.22 * Math.sin(p.angle);
        const radius = p.currentSize * scale;
        const qx = p.x;
        const bounce = Math.sin(currentTimestamp * 0.004) * 4;
        const qy = p.y - radius - (23 * screenScale) + bounce;
        
        const distToQ = Math.hypot(mouseX - qx, mouseY - qy);
        const distToPlanet = Math.hypot(mouseX - p.x, mouseY - p.y);
        
        const clickScale = Math.min(1.0, Math.max(0.65, width / 1300));
        return distToQ < 26 * clickScale || distToPlanet < radius + 15 * clickScale;
    });
    
    if (clickedPlanet) {
        cardOpeningTime = Date.now(); // Фиксируем время открытия
        
        // Скрываем старый аватар и настраиваем плавный показ нового после загрузки
        cardAvatar.style.opacity = '0';
        cardAvatar.onload = () => {
            cardAvatar.style.opacity = '1';
        };
        
        // Восстанавливаем отображение скрытых элементов карточки
        cardSubtitle.style.display = 'block';
        const ageRow = dynamicAge.closest('.card-detail-item');
        if (ageRow) ageRow.style.display = 'flex';
        emailRow.style.display = 'flex';
        tgRow.style.display = 'flex';
        cardName.classList.remove('long-name');
        
        if (clickedPlanet.hasAntonMark) {
            // Данные Антона
            cardAvatar.src = 'avatar.jpg';
            cardName.textContent = 'Anton';
            cardSubtitle.textContent = 'developer';
            dynamicAge.textContent = calculateAge();
        } else if (clickedPlanet.hasIchiMark) {
            // Данные Ichi
            cardAvatar.src = 'ichi.png';
            cardName.textContent = 'Ichi';
            cardSubtitle.textContent = 'happy dog';
            dynamicAge.textContent = calculateIchiAge();
            emailRow.style.display = 'none';
            tgRow.style.display = 'none';
        } else if (clickedPlanet.hasMysteryMark) {
            // Данные загадочного персонажа
            cardAvatar.src = 'mystery.png';
            cardName.textContent = "Here could be you, but you don't write to me";
            cardName.classList.add('long-name');
            cardSubtitle.style.display = 'none';
            if (ageRow) ageRow.style.display = 'none';
            emailRow.style.display = 'none';
            tgRow.style.display = 'none';
        }
        
        cardOverlay.classList.remove('hidden');
    }
});

// Отслеживание наведения мыши для смены курсора на pointer над выносками или самими планетами
window.addEventListener('mousemove', (e) => {
    if (currentState !== STATE_SPACE) {
        canvas.style.cursor = 'default';
        return;
    }
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const isHovered = planets.some(p => {
        if (!p.hasAntonMark && !p.hasIchiMark && !p.hasMysteryMark) return false;
        
        const scale = 1.0 + 0.22 * Math.sin(p.angle);
        const radius = p.currentSize * scale;
        const qx = p.x;
        const bounce = Math.sin(currentTimestamp * 0.004) * 4;
        const qy = p.y - radius - (23 * screenScale) + bounce;
        
        const distToQ = Math.hypot(mouseX - qx, mouseY - qy);
        const distToPlanet = Math.hypot(mouseX - p.x, mouseY - p.y);
        
        const clickScale = Math.min(1.0, Math.max(0.65, width / 1300));
        return distToQ < 26 * clickScale || distToPlanet < radius + 15 * clickScale;
    });
    
    if (isHovered) {
        canvas.style.cursor = 'pointer';
    } else {
        canvas.style.cursor = 'default';
    }
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
    currentTimestamp = Date.now();
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
            cloudGroups.forEach(g => g.length = 0);
            
            cloudParticles.forEach(p => {
                cloudGroups[p.colorIndex].push(p);
            });
            
            for (let g = 0; g < spaceColors.length; g++) {
                const group = cloudGroups[g];
                if (group.length === 0) continue;
                
                const template = spaceColors[g];
                const repAlpha = group[0].alpha;
                const repL = group[0].l;
                
                ctx.fillStyle = `hsla(${template.h}, ${template.s}%, ${repL}%, ${repAlpha})`;
                ctx.beginPath();
                
                group.forEach(p => {
                    ctx.rect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
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
        // 1. Случайный спавн комет в фазе SPACE (частота спавна увеличена в 2 раза)
        if (currentState === STATE_SPACE && Math.random() < 0.004) {
            comets.push(new Comet());
        }

        // 2. Обновляем физику всех объектов
        asteroids.forEach(asteroid => asteroid.update());
        planets.forEach(planet => planet.update());
        spaceships.forEach(ship => ship.update());
        
        for (let i = comets.length - 1; i >= 0; i--) {
            const comet = comets[i];
            comet.update();
            if (comet.isDead) {
                comets.splice(i, 1);
            }
        }
        
        // 2a. Отрисовываем заднюю полусферу пояса астероидов (Z-глубина < 0)
        asteroids.forEach(asteroid => {
            if (Math.sin(asteroid.angle) < 0) {
                asteroid.draw();
            }
        });
        
        // 3. Создаем объект центрального светила (Солнца) для Z-сортировки
        const sun = {
            y: centerY,
            draw: () => {
                if (isDoubleStar) {
                    const orbitR = 20 * screenScale;
                    const rotSpeed = 0.002;
                    const angle1 = currentTimestamp * rotSpeed;
                    const angle2 = angle1 + Math.PI;
                    
                    const starsData = [
                        {
                            x: centerX + Math.cos(angle1) * orbitR,
                            y: centerY + Math.sin(angle1) * orbitR * systemTilt,
                            pulseOffset: 0
                        },
                        {
                            x: centerX + Math.cos(angle2) * orbitR,
                            y: centerY + Math.sin(angle2) * orbitR * systemTilt,
                            pulseOffset: Math.PI
                        }
                    ];
                    
                    starsData.forEach(s => {
                        const bounce = Math.sin(currentTimestamp * 0.004 + s.pulseOffset) * 0.03;
                        const baseSize = 13 * screenScale;
                        const size = baseSize * (1.0 + bounce);
                        
                        const glowGrad = ctx.createRadialGradient(
                            s.x, s.y, size * 0.1,
                            s.x, s.y, size * 2.8
                        );
                        glowGrad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
                        glowGrad.addColorStop(0.25, 'rgba(0, 220, 255, 0.45)');
                        glowGrad.addColorStop(0.6, 'rgba(0, 100, 255, 0.12)');
                        glowGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
                        
                        ctx.save();
                        ctx.globalCompositeOperation = 'screen';
                        ctx.fillStyle = glowGrad;
                        ctx.beginPath();
                        ctx.arc(s.x, s.y, size * 2.8, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.restore();
                        
                        const coreGrad = ctx.createRadialGradient(
                            s.x, s.y, 0,
                            s.x, s.y, size
                        );
                        coreGrad.addColorStop(0, '#ffffff');
                        coreGrad.addColorStop(0.5, '#e0f7fa');
                        coreGrad.addColorStop(1.0, '#80deea');
                        
                        ctx.save();
                        ctx.shadowBlur = 15 * screenScale;
                        ctx.shadowColor = '#00d2ff';
                        ctx.fillStyle = coreGrad;
                        ctx.beginPath();
                        ctx.arc(s.x, s.y, size, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.restore();
                    });
                } else {
                    const bounce = Math.sin(currentTimestamp * 0.003) * 0.04;
                    const baseSize = 25 * screenScale;
                    const size = baseSize * (1.0 + bounce);
                    
                    const glowGrad = ctx.createRadialGradient(
                        centerX, centerY, size * 0.1,
                        centerX, centerY, size * 3.0
                    );
                    glowGrad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
                    glowGrad.addColorStop(0.2, 'rgba(255, 200, 0, 0.7)');
                    glowGrad.addColorStop(0.45, 'rgba(255, 70, 0, 0.35)');
                    glowGrad.addColorStop(0.7, 'rgba(255, 0, 0, 0.08)');
                    glowGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
                    
                    ctx.save();
                    ctx.globalCompositeOperation = 'screen';
                    ctx.fillStyle = glowGrad;
                    ctx.beginPath();
                    ctx.arc(centerX, centerY, size * 3.0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                    
                    const time = currentTimestamp * 0.001;
                    while (solarProminences.length < 4) {
                        solarProminences.push({
                            angle: Math.random() * Math.PI * 2,
                            maxHeight: size * (0.3 + Math.random() * 0.25),
                            loopWidth: 0.08 + Math.random() * 0.12,
                            life: 1.0,
                            decay: 0.001 + Math.random() * 0.002
                        });
                    }
                    ctx.save();
                    ctx.globalCompositeOperation = 'screen';
                    ctx.lineWidth = 2.2 * screenScale;
                    ctx.shadowBlur = 10 * screenScale;
                    ctx.shadowColor = '#ff4500';
                    for (let i = solarProminences.length - 1; i >= 0; i--) {
                        const p = solarProminences[i];
                        p.life -= p.decay;
                        if (p.life <= 0) {
                            solarProminences.splice(i, 1);
                            continue;
                        }
                        p.angle += (Math.random() - 0.5) * 0.004;
                        let alpha = 1.0;
                        if (p.life > 0.8) {
                            alpha = (1.0 - p.life) / 0.2;
                        } else if (p.life < 0.3) {
                            alpha = p.life / 0.3;
                        }
                        ctx.strokeStyle = `rgba(255, 69, 0, ${alpha * 0.45})`;
                        const p1x = centerX + Math.cos(p.angle - p.loopWidth) * size;
                        const p1y = centerY + Math.sin(p.angle - p.loopWidth) * size;
                        const p2x = centerX + Math.cos(p.angle + p.loopWidth) * size;
                        const p2y = centerY + Math.sin(p.angle + p.loopWidth) * size;
                        const pulse = 1.0 + Math.sin(time * 1.2 + i) * 0.15;
                        const h = p.maxHeight * Math.sin(p.life * Math.PI) * pulse;
                        const ctrlX = centerX + Math.cos(p.angle) * (size + h);
                        const ctrlY = centerY + Math.sin(p.angle) * (size + h);
                        ctx.beginPath();
                        ctx.moveTo(p1x, p1y);
                        ctx.quadraticCurveTo(ctrlX, ctrlY, p2x, p2y);
                        ctx.stroke();
                    }
                    ctx.restore();
                    
                    const coreGrad = ctx.createRadialGradient(
                        centerX, centerY, 0,
                        centerX, centerY, size
                    );
                    coreGrad.addColorStop(0, '#ffffff');
                    coreGrad.addColorStop(0.4, '#ffe57f');
                    coreGrad.addColorStop(1.0, '#ff8f00');
                    
                    ctx.save();
                    ctx.shadowBlur = 20 * screenScale;
                    ctx.shadowColor = '#ff4500';
                    ctx.fillStyle = coreGrad;
                    ctx.beginPath();
                    ctx.arc(centerX, centerY, size, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();

                    ctx.save();
                    ctx.globalCompositeOperation = 'screen';
                    for (let i = 0; i < 4; i++) {
                        const flareAngle = (i * Math.PI * 2) / 4 - time * 0.05;
                        const flareDist = size * (0.3 + Math.sin(time * 0.8 + i) * 0.2);
                        const fx = centerX + Math.cos(flareAngle) * flareDist;
                        const fy = centerY + Math.sin(flareAngle) * flareDist;
                        const fSize = size * (0.15 + Math.sin(time * 2.3 + i) * 0.08);
                        if (fSize > 0) {
                            const flareGrad = ctx.createRadialGradient(fx, fy, 0, fx, fy, fSize);
                            flareGrad.addColorStop(0, '#ffffff');
                            flareGrad.addColorStop(0.4, 'rgba(255, 230, 0, 0.8)');
                            flareGrad.addColorStop(1, 'rgba(255, 69, 0, 0)');
                            ctx.fillStyle = flareGrad;
                            ctx.beginPath();
                            ctx.arc(fx, fy, fSize, 0, Math.PI * 2);
                            ctx.fill();
                        }
                    }
                    ctx.restore();
                }
            }
        };

        // 4. Объединяем в очередь рендеринга для Z-сортировки по глубине (координате Y) только крупные объекты.
        // Астероиды рисуются отдельно без сортировки для гигантского прироста производительности.
        const renderQueue = [sun, ...planets, ...comets, ...spaceships];
        // Сортируем: объекты с меньшим Y (на заднем плане) рисуются первыми
        renderQueue.sort((a, b) => a.y - b.y);
        
        // 5. Отрисовываем отсортированную очередь (планеты красиво огибают Солнце спереди и сзади!)
        renderQueue.forEach(obj => {
            obj.draw();
        });
        
        // 6. Отрисовываем переднюю полусферу пояса астероидов (Z-глубина >= 0)
        asteroids.forEach(asteroid => {
            if (Math.sin(asteroid.angle) >= 0) {
                asteroid.draw();
            }
        });
    }

    requestAnimationFrame(animate);
}

// Запуск приложения
resizeCanvas();
initProtoplanetaryCloud();
animate();
