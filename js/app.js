// --- Configuration & State ---
const CONFIG = {
    LOGO_THICKNESS: 3,
    LOGO_GAP: 8.8,
    LOGO_LENGTH: 32,
};

let state = {
    posts: [],
    filteredPosts: [],
    currentCategory: 'all',
    flipState: null,
    interfaceRevealed: false
};

// --- Initialization ---
if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
}
window.scrollTo(0, 0);

document.addEventListener('DOMContentLoaded', () => {
    // 1. Force Interface to stay hidden during loader time via JS
    gsap.set(['#main-content', '.glass-footer'], { opacity: 0 });

    // 2. Initialize Lucide Icons
    if (typeof lucide !== 'undefined') lucide.createIcons();
    
    // 3. Register GSAP Plugins
    gsap.registerPlugin(ScrollTrigger, Flip, CustomEase);
    CustomEase.create("apple-glass", "0.22, 1, 0.36, 1");
    
    // 4. Start Core Systems
    initLoader();
    initLiquidBackground();
    initMarquee(); // New Dynamic Marquee
    initSmallLoaderLogo();
    initRollingLinks();
    initCursor(); 
    initTheme();
    initCategories();
    
    // 5. Load & Reveal Data
    loadContent();
});


// --- Loader System ---
function initLoader() {
    const loader = document.getElementById('loader');
    if (!loader) return;
    
    // 1. Initialize Fancy Main Loader Animation (Dynamic Responsive Scale)
    const container = document.getElementById('loader-pillars');
    if (container) {
        // Calculate responsive scale based on screen width (Unit width is 62px)
        const targetWidth = Math.min(500, window.innerWidth * 0.85);
        const scale = targetWidth / 62;
        
        const thickness = CONFIG.LOGO_THICKNESS * scale;
        const gap = CONFIG.LOGO_GAP * scale;
        const length = CONFIG.LOGO_LENGTH * scale;

        // Set container size to match the scaled pillars
        container.style.width = targetWidth + 'px';
        container.style.height = length + 'px';

        const patterns = [
            [0, 5, 5, 2, 2, 0, 0], 
            [1, 0, 0, 4, 4, 1, 1], 
            [2, 4, 4, 1, 1, 2, 2], 
            [3, 1, 1, 5, 5, 3, 3], 
            [4, 2, 2, 3, 3, 4, 4], 
            [5, 3, 3, 0, 0, 5, 5], 
        ];

        const luxuryEase = CustomEase.create("luxury", "0.65, 0, 0.35, 1");
        const times = [0, 0.15, 0.35, 0.5, 0.7, 0.85, 1];

        for (let i = 0; i < 6; i++) {
            const p = document.createElement('div');
            p.className = 'absolute pillar-loader top-0'; // Used the new loader class
            p.style.width = thickness + 'px';
            p.style.height = length + 'px';
            p.style.left = '0';
            container.appendChild(p);

            const xValues = patterns[i].map(pos => pos * (thickness + gap));
            let tl = gsap.timeline({ repeat: -1, delay: i * 0.12 }); // Targeted 0.12s stagger
            tl.set(p, { x: xValues[0] });

            const totalDuration = 8; // Majestic loop
            for (let idx = 1; idx < xValues.length; idx++) {
                const startTime = times[idx] * totalDuration;
                const prevStartTime = times[idx-1] * totalDuration;
                const segmentDuration = startTime - prevStartTime;
                tl.to(p, { 
                    x: xValues[idx], 
                    duration: segmentDuration, 
                    ease: luxuryEase
                }, startTime - segmentDuration);
            }
        }
    }

    // 2. Ensure Loader Shows for at least 2 seconds before fading out
    const minLoadingTime = 2000;
    const startTimeStamp = Date.now();

    window.addEventListener('load', () => {
        const elapsedTime = Date.now() - startTimeStamp;
        const delayMs = Math.max(0, minLoadingTime - elapsedTime);
        setTimeout(() => {
            const masterTl = gsap.timeline({
                onComplete: () => ScrollTrigger.refresh()
            });

            // 1. Fade out the primary loader pillars
            masterTl.to(loader, {
                opacity: 0,
                duration: 1.4,
                ease: "power2.inOut",
                onComplete: () => loader.style.display = 'none'
            });
            
            // 2. Atmospheric Reveal (Background Overlay)
            // This slowly reveals the WebGL liquid animation
            masterTl.to('#liquid-reveal-overlay', {
                opacity: 0,
                duration: 2.5, // Slow, cinematic reveal
                ease: "power1.inOut",
                onComplete: () => {
                    document.getElementById('liquid-reveal-overlay').style.display = 'none';
                }
            }, "-=0.4"); // Slight overlap with loader fade for smoothness

            // 3. Cinematic Interface Stagger
            // Starts 1.2s into the atmospheric reveal for a layered look
            masterTl.to(['#navbar-container', '#main-content', '.glass-footer'], {
                opacity: 1,
                y: 0,
                duration: 1.4,
                stagger: 0.2,
                ease: "apple-glass",
                onStart: function() {
                    // Trigger card animations as soon as their container starts revealing
                    if (this.targets().some(t => t.id === 'main-content')) {
                        state.interfaceRevealed = true;
                        initScrollAnimations();
                    }
                }
            }, "-=1.8"); // Overlap with overlay reveal

        }, delayMs);
    });
}

// --- ASCII Interactive Background (Inspired by romainavalle.dev, Colors by collating.info) ---
function initLiquidBackground() {
    const container = document.getElementById('liquid-bg');
    if (!container) return;

    container.innerHTML = '';
    
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.style.display = 'none';
    container.appendChild(sourceCanvas);

    const displayCanvas = document.createElement('canvas');
    displayCanvas.style.position = 'absolute';
    displayCanvas.style.inset = '0';
    displayCanvas.style.zIndex = '0';
    container.appendChild(displayCanvas);
    
    const gl = sourceCanvas.getContext('webgl', { preserveDrawingBuffer: true });
    const ctx = displayCanvas.getContext('2d', { alpha: false });

    if (!gl) return;

    // --- Shader Logic (Density Field) ---
    const vsSource = `attribute vec2 position; void main() { gl_Position = vec4(position, 0.0, 1.0); }`;
    const fsSource = `
        precision highp float;
        uniform vec2 u_resolution;
        uniform vec2 u_mouse;
        uniform float u_time;

        mat2 rotate(float angle) { return mat2(cos(angle), -sin(angle), sin(angle), cos(angle)); }
        vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
        float snoise(vec2 v){
          const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
          vec2 i  = floor(v + dot(v, C.yy) );
          vec2 x0 = v - i + dot(i, C.xx);
          vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
          vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1; i = mod(i, 289.0);
          vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
          vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
          m = m*m ; m = m*m ;
          vec3 x = 2.0 * fract(p * C.www) - 1.0; vec3 h = abs(x) - 0.5; vec3 ox = floor(x + 0.5); vec3 a0 = x - ox;
          m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
          vec3 g; g.x = a0.x * x0.x + h.x * x0.y; g.yz = a0.yz * x12.xz + h.yz * x12.yw;
          return 130.0 * dot(m, g);
        }

        void main() {
            vec2 st = gl_FragCoord.xy / u_resolution.xy;
            float ratio = u_resolution.x / u_resolution.y;
            vec2 adjustedSt = st * vec2(ratio, 1.0);
            float slowTime = u_time * 0.4;

            // Layer 1: Broad Diagonal Flow
            vec2 flowA = adjustedSt * 0.6 + vec2(slowTime * 0.1, slowTime * 0.05);
            float n1 = snoise(flowA) * 0.5 + 0.5;

            // Layer 2: Distortion & Wispiness
            vec2 flowB = adjustedSt * 0.8 - vec2(slowTime * 0.05, slowTime * 0.08) + n1 * 0.2;
            float n2 = snoise(flowB) * 0.5 + 0.5;

            // Lush, Continuous Gradient (No bands, no halos)
            float finalMask = mix(n1, n2, 0.5);
            
            // Linearly remap the core noise range to prevent huge plateaus at the extremes,
            // ensuring each brightness band has a relatively equal amount of screen space.
            finalMask = (finalMask - 0.15) / 0.7;
            finalMask = clamp(finalMask, 0.0, 1.0);
            
            gl_FragColor = vec4(vec3(finalMask), 1.0);
        }
    `;

    const program = gl.createProgram();
    const vs = gl.createShader(gl.VERTEX_SHADER); gl.shaderSource(vs, vsSource); gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER); gl.shaderSource(fs, fsSource); gl.compileShader(fs);
    gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program); gl.useProgram(program);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(posLoc); gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const locations = {
        resolution: gl.getUniformLocation(program, "u_resolution"),
        mouse: gl.getUniformLocation(program, "u_mouse"),
        time: gl.getUniformLocation(program, "u_time"),
    };

    // --- ASCII Config ---
    const CHARS = ' .:-=+*#%@'; // More standardized density levels
    const charArray = CHARS.split('');
    const charCount = charArray.length;
    const charSize = 10;
    
    let cols, rows, width, height;
    function resize() {
        width = window.innerWidth; height = window.innerHeight;
        displayCanvas.width = width; displayCanvas.height = height;
        cols = Math.ceil(width / charSize); rows = Math.ceil(height / charSize);
        sourceCanvas.width = cols; sourceCanvas.height = rows;
        gl.viewport(0, 0, cols, rows);
        gl.uniform2f(locations.resolution, cols, rows);
    }
    window.addEventListener('resize', resize);
    resize();

    let mouseX = cols / 2, mouseY = rows / 2;
    window.addEventListener('mousemove', e => {
        mouseX = (e.clientX / width) * cols;
        mouseY = rows - (e.clientY / height) * rows;
    });

    // --- Color Gradation Engine ---
    const pixels = new Uint8Array(cols * rows * 4);
    let themeState = { lastIsDark: null, bg: null, palette: [] };

    function hexToRgb(hex) {
        const bigint = parseInt(hex.replace('#', ''), 16);
        return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
    }

    function interpolateRgb(c1, c2, t) {
        return {
            r: Math.round(c1.r + (c2.r - c1.r) * t),
            g: Math.round(c1.g + (c2.g - c1.g) * t),
            b: Math.round(c1.b + (c2.b - c1.b) * t)
        };
    }

    function updateTheme() {
        const isDark = document.documentElement.classList.contains('dark-mode');
        if (isDark !== themeState.lastIsDark) {
            const s = getComputedStyle(document.documentElement);
            themeState.bg = s.getPropertyValue('--background').trim();
            themeState.palette = [
                hexToRgb(s.getPropertyValue('--blob-1').trim() || '#f8fafc'),
                hexToRgb(s.getPropertyValue('--blob-2').trim() || '#e2e8f0'),
                hexToRgb(s.getPropertyValue('--blob-3').trim() || '#cbd5e1'),
                hexToRgb(s.getPropertyValue('--blob-4').trim() || '#94a3b8'),
                hexToRgb(s.getPropertyValue('--blob-5').trim() || '#64748b')
            ];
            const p5 = themeState.palette[4];
            themeState.textColor = `rgb(${p5.r}, ${p5.g}, ${p5.b})`;
            themeState.lastIsDark = isDark;
        }
    }

    function getGradationColor(lum) {
        const p = themeState.palette;
        let rgb;
        // 5-Color Gradation Ramp (4 Zones)
        if (lum < 0.25) {
            rgb = interpolateRgb(p[0], p[1], lum * 4);
        } else if (lum < 0.5) {
            rgb = interpolateRgb(p[1], p[2], (lum - 0.25) * 4);
        } else if (lum < 0.75) {
            rgb = interpolateRgb(p[2], p[3], (lum - 0.5) * 4);
        } else {
            rgb = interpolateRgb(p[3], p[4], (lum - 0.75) * 4);
        }
        return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
    }

    function render(now) {
        updateTheme();
        gl.uniform1f(locations.time, now * 0.001);
        gl.uniform2f(locations.mouse, mouseX, mouseY);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.readPixels(0, 0, cols, rows, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

        ctx.fillStyle = themeState.bg;
        ctx.fillRect(0, 0, width, height);

        // User-specified 9-character set
        const charArray = ".,:;|{#&@".split('');
        const charCount = charArray.length;

        for (let y = 0; y < rows; y++) {
            const screenY = (rows - y) * charSize - charSize / 2;
            for (let x = 0; x < cols; x++) {
                const i = (y * cols + x) * 4;
                
                // Stable brightness mapping (Flicker/Jitter removed)
                const brightness = pixels[i] / 255;
                
                if (brightness > 0.005) {  
                    const charIdx = Math.floor(brightness * (charCount - 1));
                    ctx.fillStyle = themeState.textColor;
                    ctx.fillText(charArray[charIdx], x * charSize + charSize / 2, screenY);
                }
            }
        }
        requestAnimationFrame(render);
    }
    requestAnimationFrame(render);
}

// --- Small Loader Logo (1:1 Next.js Rhythmic Restoration) ---
function initSmallLoaderLogo() {
    const containers = [document.getElementById('small-loader-logo'), document.getElementById('mobile-loader-logo')];
    
    const patterns = [
        [0, 5, 5, 2, 2, 0, 0], 
        [1, 0, 0, 4, 4, 1, 1], 
        [2, 4, 4, 1, 1, 2, 2], 
        [3, 1, 1, 5, 5, 3, 3], 
        [4, 2, 2, 3, 3, 4, 4], 
        [5, 3, 3, 0, 0, 5, 5], 
    ];

    const luxuryEase = CustomEase.create("luxury", "0.65, 0, 0.35, 1");
    const times = [0, 0.15, 0.35, 0.5, 0.7, 0.85, 1];

    containers.forEach(container => {
        if (!container) return;
        for (let i = 0; i < 6; i++) {
            const p = document.createElement('div');
            p.className = 'absolute pillar-logo top-0'; // Used the new logo class
            p.style.width = CONFIG.LOGO_THICKNESS + 'px';
            p.style.height = CONFIG.LOGO_LENGTH + 'px';
            p.style.left = '0';
            container.appendChild(p);

            const xValues = patterns[i].map(pos => pos * (CONFIG.LOGO_THICKNESS + CONFIG.LOGO_GAP));
            let tl = gsap.timeline({ repeat: -1, delay: i * 0.08 });
            tl.set(p, { x: xValues[0] });

            const totalDuration = 7;
            for (let idx = 1; idx < xValues.length; idx++) {
                const startTime = times[idx] * totalDuration;
                const prevStartTime = times[idx-1] * totalDuration;
                const segmentDuration = startTime - prevStartTime;
                tl.to(p, { 
                    x: xValues[idx], 
                    duration: segmentDuration, 
                    ease: luxuryEase
                }, startTime - segmentDuration);
            }
        }
    });
}

// --- Custom Cursor (Liquid Glass Style) ---
function initCursor() {
    const glassWrapper = document.getElementById('cursor-glass-wrapper');
    const glass = document.getElementById('cursor-glass');

    if (!glassWrapper || window.innerWidth < 1024) return;

    gsap.set(glassWrapper, { display: 'block' });
    gsap.set(glass, { scale: 0.22 }); // Initial base size (22px relative to 100px)

    // High-performance setters on WRAPPER
    const xGlassTo = gsap.quickTo(glassWrapper, "x", { duration: 0.15, ease: "power4.out" });
    const yGlassTo = gsap.quickTo(glassWrapper, "y", { duration: 0.15, ease: "power4.out" });

    window.addEventListener('mousemove', e => {
        xGlassTo(e.clientX);
        yGlassTo(e.clientY);
    });

    // Interactive States (Animate INNER element, scale position stays stable on wrapper)
    const interactives = 'a, button, .nav-link, .article-card, .nav-back, .nav-cta, .nav-share, [data-interactive], #theme-toggle';
    
    document.addEventListener('mouseover', e => {
        const target = e.target.closest(interactives);
        if (target && !target.dataset.cursorActive) {
            // Check if it's an article-card, only active for preview (not when open)
            if (target.classList.contains('article-card') && target.classList.contains('active')) return;
            
            target.dataset.cursorActive = "true";
            gsap.to(glass, {
                scale: 0.74, // 74px (from 100px base) - Sharp rendering
                duration: 0.3,
                ease: "power2.out",
                overwrite: true
            });
        }
    });

    document.addEventListener('mouseout', e => {
        const target = e.target.closest(interactives);
        if (target && target.dataset.cursorActive) {
            const related = e.relatedTarget;
            if (!related || !target.contains(related)) {
                delete target.dataset.cursorActive;
                
                const relatedInteractive = related ? related.closest(interactives) : null;
                const isRelatedActiveCard = relatedInteractive && relatedInteractive.classList.contains('article-card') && relatedInteractive.classList.contains('active');

                if (!relatedInteractive || isRelatedActiveCard) {
                    gsap.to(glass, {
                        scale: 0.22, // Back to 22px
                        duration: 0.3,
                        ease: "power2.inOut",
                        overwrite: true
                    });
                }
            }
        }
    });
}

// --- Content System ---
function formatDate(ms) {
    return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase();
}

// --- Dynamic Marquee (Observer-Based & Fully Bi-Directional) ---
function initMarquee() {
    const marquee = document.querySelector('.marquee-content');
    if (!marquee) return;

    // 1. Prepare Content for Infinite Looping
    const originalContent = marquee.innerHTML;
    marquee.innerHTML += originalContent; // Duplicate content
    const totalWidth = marquee.scrollWidth / 2;

    // 2. State & Physics Management
    let x = 0;
    const proxy = { speed: -1.2 }; // Default: Scroll Down = Go Right (negative speed for x -= speed)
    let currentMoveDir = -1; // -1 = Right, 1 = Left

    // 3. The Animation Loop
    gsap.ticker.add(() => {
        x -= proxy.speed;
        if (x <= -totalWidth) x += totalWidth;
        if (x > 0) x -= totalWidth;
        gsap.set(marquee, { x: x });
    });

    // 4. Robust Direction & Velocity Detection (Observe)
    // Down Scroll = Right (-1), Up Scroll = Left (1)
    ScrollTrigger.observe({
        target: window,
        type: "wheel,touch,scroll",
        onDown: () => {
            currentMoveDir = -1; // Set Target Dir: Right
            updateMarqueeSpeed(currentMoveDir);
        },
        onUp: () => {
            currentMoveDir = 1; // Set Target Dir: Left
            updateMarqueeSpeed(currentMoveDir);
        },
        onChange: (self) => {
            // Continuous velocity pulse
            const vel = Math.abs(self.vy || self.deltaY || 0);
            const boostedSpeed = (1.2 + vel / 150) * currentMoveDir;
            
            gsap.to(proxy, {
                speed: boostedSpeed,
                duration: 0.2,
                overwrite: true,
                onComplete: () => {
                    gsap.to(proxy, {
                        speed: currentMoveDir * 1.2,
                        duration: 1.5,
                        ease: "power2.inOut",
                        overwrite: false
                    });
                }
            });
        }
    });

    function updateMarqueeSpeed(dir) {
        gsap.to(proxy, {
            speed: dir * 1.2,
            duration: 0.4,
            ease: "power2.out",
            overwrite: 'auto'
        });
    }
}

async function loadContent() {
    try {
        state.posts = typeof blogPosts !== 'undefined' ? blogPosts : [];
        filterContent('all');
        setTimeout(() => {
            updateNavIndicator();
            initDeepLinking(); // Check for hash on load
        }, 100); 
    } catch (e) { console.error('Data failed:', e); }
}

function filterContent(category) {
    state.currentCategory = category;
    state.filteredPosts = category === 'all' 
        ? [...state.posts] 
        : state.posts.filter(p => p.category === category);

    // Hoist pinned posts to the top
    state.filteredPosts.sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));

    renderPosts();
    if (state.interfaceRevealed) {
        setTimeout(() => {
            initScrollAnimations();
            ScrollTrigger.refresh();
        }, 100);
    }
    
    document.querySelectorAll('.nav-link').forEach(link => {
        const isActive = link.dataset.category === category;
        link.classList.toggle('active', isActive);
    });
    updateNavIndicator();
}

function updateNavIndicator() {
    const indicator = document.getElementById('nav-indicator');
    const activeBtn = document.querySelector('.nav-link.active');
    const container = document.getElementById('nav-links-container');
    if (!indicator || !activeBtn || !container) return;

    gsap.to(indicator, {
        x: activeBtn.offsetLeft,
        width: activeBtn.offsetWidth,
        opacity: 1,
        duration: 0.5,
        ease: "apple-glass"
    });
}

function renderPosts() {
    const grid = document.getElementById('blog-grid');
    if (!grid) return;
    grid.innerHTML = state.filteredPosts.map(post => `
        <article id="${post.slug}" class="article-card glass-panel p-8 md:p-12 group cursor-pointer" onclick="openPost(this)">
            <div class="article-header mb-6">
                <div class="article-meta relative z-10 flex gap-4 text-[12px] uppercase tracking-widest text-accent opacity-50 mb-4 font-mono items-center">
                    ${post.isPinned ? `<span class="featured-tag mr-2">Featured</span>` : ''}
                    <span>${formatDate(post.published_at)}</span> / <span>${post.category}</span>
                </div>
                <h2 class="article-title relative z-10 font-mono text-3xl md:text-6xl font-normal tracking-tight leading-[1.05]">${post.title}</h2>
            </div>

            <div class="article-preview-wrap">
                <div class="article-preview-text relative z-10 text-[16px] leading-relaxed font-mono mb-6">
                    ${post.content.substring(0, 240)}...
                </div>
                
                <div class="nav-cta-container relative z-10 pt-8 mt-12 w-full">
                    <div class="tracing-line"></div>
                    <div class="nav-cta text-accent opacity-50">
                        <span class="nav-label">Read article</span> <span class="nav-icon">→</span>
                    </div>
                </div>
            </div>

            <div class="article-content mt-0 hidden text-accent">
                <div class="prose-body text-[16px] leading-relaxed font-mono">
                    ${post.content}
                </div>

                <div class="pt-12 mt-24 relative w-full flex justify-between items-center">
                    <div class="tracing-line"></div>
                    <div class="nav-back text-accent opacity-50 cursor-pointer" onclick="closePost(event)">
                        <span class="nav-icon">←</span> <span class="nav-label">Back to previous</span>
                    </div>
                    <div class="nav-share text-accent opacity-50 cursor-pointer" onclick="copyShareLink('${post.slug}', this, event)">
                        <span class="nav-label">Share Link</span> <span class="nav-icon">+</span>
                    </div>
                </div>
            </div>
        </article>
    `).join('');
}

function initScrollAnimations() {
    ScrollTrigger.getAll().forEach(t => t.kill());
    
    ScrollTrigger.batch(".article-card", {
        start: "top 95%",
        onEnter: batch => {
            batch.forEach((card, i) => {
                const textElements = card.querySelectorAll('.article-meta, .article-title, .article-preview-text, .nav-cta, .nav-share');
                const lines = card.querySelectorAll('.tracing-line');

                const tl = gsap.timeline();

                // 1. Reveal card shell
                tl.to(card, {
                    opacity: 1, y: 0,
                    duration: 1.2,
                    ease: "apple-glass",
                    delay: i * 0.15 // Slightly more pronounced stagger
                }, 0);

                // 2. Energetic, faster line drawing
                tl.to(lines, {
                    scaleX: 1, 
                    duration: 2.0,
                    ease: "power4.inOut"
                }, i * 0.15);

                // 3. Energetic staggered text reveal
                tl.fromTo(textElements, 
                    { opacity: 0, y: 20 },
                    {
                        opacity: 1, y: 0,
                        duration: 1.2,
                        stagger: 0.1,
                        ease: "power3.out"
                    }, 
                    (i * 0.1) + 0.3
                );
            });
        },
        once: true
    });

    // Hover animation (Refined Decoupled Logic)
    gsap.utils.toArray('.article-card').forEach((card) => {
        const cta = card.querySelector('.nav-cta');
        const label = cta?.querySelector('.nav-label');
        const icon = cta?.querySelector('.nav-icon');
        
        card.addEventListener('mouseenter', () => {
            if (!card.classList.contains('active')) {
                gsap.to(card, { y: -12, duration: 0.4, ease: "power2.out" });
                if (cta) {
                    gsap.to(cta, { gap: "1.4rem", opacity: 1, duration: 0.5, ease: "power2.out" });
                    if (label) gsap.to(label, { letterSpacing: "0.8em", duration: 0.4, ease: "power2.out" });
                    if (icon) gsap.to(icon, { x: 8, duration: 0.5, ease: "power3.out" });
                }
            }
        });

        card.addEventListener('mouseleave', () => {
            if (!card.classList.contains('active')) {
                gsap.to(card, { y: 0, duration: 0.6, ease: "power2.out" });
                if (cta) {
                    gsap.to(cta, { gap: "0.6rem", opacity: 0.5, duration: 0.6, ease: "power2.out" });
                    if (label) gsap.to(label, { letterSpacing: "0.4em", duration: 0.6, ease: "power2.out" });
                    if (icon) gsap.to(icon, { x: 0, duration: 0.6, ease: "power2.out" });
                }
            }
        });
    });

    // Global Listeners for Decoupled Interactions
    document.addEventListener('mouseover', (e) => {
        const back = e.target.closest('.nav-back');
        const share = e.target.closest('.nav-share');
        
        // Use relatedTarget to prevent flicker when moving between icon/label
        if (back && !back.contains(e.relatedTarget)) {
            const label = back.querySelector('.nav-label');
            const icon = back.querySelector('.nav-icon');
            gsap.to(back, { gap: "1.4rem", opacity: 1, duration: 0.5, ease: "power2.out", overwrite: true });
            // Anchor arrow: Text expands right toward center. No x-offset needed.
            if (label) gsap.to(label, { x: 0, letterSpacing: "0.8em", duration: 0.4, ease: "power2.out", overwrite: true });
            if (icon) gsap.to(icon, { x: 0, duration: 0.5, ease: "power3.out", overwrite: true });
        }
        
        if (share && !share.contains(e.relatedTarget)) {
            const label = share.querySelector('.nav-label');
            const icon = share.querySelector('.nav-icon');
            gsap.to(share, { gap: "1.4rem", opacity: 1, duration: 0.5, ease: "power2.out", overwrite: true });
            // For 'Share Link', right-anchoring is natural due to flex justify-between. 
            // We only expand letter-spacing; layout keeps '+' and 'k' stable.
            if (label) gsap.to(label, { x: 0, letterSpacing: "0.8em", duration: 0.4, ease: "power2.out", overwrite: true });
            if (icon) gsap.to(icon, { x: 0, duration: 0.5, ease: "power3.out", overwrite: true });
        }
    });

    document.addEventListener('mouseout', (e) => {
        const back = e.target.closest('.nav-back');
        const share = e.target.closest('.nav-share');
        
        // Use relatedTarget to prevent reset when moving between icon/label
        if (back && !back.contains(e.relatedTarget)) {
            const label = back.querySelector('.nav-label');
            const icon = back.querySelector('.nav-icon');
            gsap.to(back, { gap: "0.6rem", opacity: 0.5, duration: 0.6, ease: "power2.out", overwrite: true });
            if (label) gsap.to(label, { x: 0, letterSpacing: "0.4em", duration: 0.6, ease: "power2.out", overwrite: true });
            if (icon) gsap.to(icon, { x: 0, duration: 0.6, ease: "power2.out", overwrite: true });
        }
        
        if (share && !share.contains(e.relatedTarget)) {
            const label = share.querySelector('.nav-label');
            const icon = share.querySelector('.nav-icon');
            gsap.to(share, { gap: "0.6rem", opacity: 0.5, duration: 0.6, ease: "power2.out", overwrite: true });
            if (label) gsap.to(label, { x: 0, letterSpacing: "0.4em", duration: 0.6, ease: "power2.out", overwrite: true });
            if (icon) gsap.to(icon, { x: 0, duration: 0.6, ease: "power2.out", overwrite: true });
        }
    });
}

function initRollingLinks() {
    document.querySelectorAll('.nav-link, .rolling-link').forEach(link => {
        const content = link.innerHTML;
        link.innerHTML = `<div class="nav-link-rolling overflow-hidden relative" style="height: 1.2em; line-height: 1.2em;">
                <div class="nav-link-inner block flex items-center gap-2">${content}</div>
                <div class="nav-link-inner absolute top-full left-0 block w-full whitespace-nowrap flex items-center gap-2">${content}</div>
            </div>`;
        const inners = link.querySelectorAll('.nav-link-inner');
        link.addEventListener('mouseenter', () => gsap.to(inners, { y: "-100%", duration: 0.6, stagger: 0.05, ease: "expo.out" }));
        link.addEventListener('mouseleave', () => gsap.to(inners, { y: "0%", duration: 0.6, stagger: 0.05, ease: "expo.out" }));
    });
}

function initCategories() {
    document.querySelectorAll('.nav-link, .nav-link-mobile').forEach(link => {
        link.addEventListener('click', () => filterContent(link.dataset.category));
    });

    // Mobile Menu System (Push-Down Architecture)
    const menuBtn = document.getElementById('menu-trigger');
    const mobileDrawer = document.getElementById('mobile-drawer');
    const mainContent = document.getElementById('main-content');
    let isMenuOpen = false;

    const toggleMenu = (forceClose = false) => {
        const menuIconOpen = document.getElementById('menu-icon-open');
        const menuIconClose = document.getElementById('menu-icon-close');
        
        isMenuOpen = forceClose ? false : !isMenuOpen;
        
        // Stabilize icons
        gsap.killTweensOf([menuIconOpen, menuIconClose]);

        if (isMenuOpen) {
            // Expansion
            gsap.to(mobileDrawer, { height: "auto", opacity: 1, duration: 0.4, ease: "apple-glass" });
            gsap.to(mainContent, { y: 340, duration: 0.4, ease: "apple-glass" }); // Shift content down
            gsap.to(menuIconOpen, { rotation: 90, opacity: 0, duration: 0.3, transformOrigin: "50% 50%", ease: "apple-glass" });
            gsap.fromTo(menuIconClose, { rotation: -90, opacity: 0 }, { rotation: 0, opacity: 1, duration: 0.3, transformOrigin: "50% 50%", ease: "apple-glass" });
        } else {
            // Collapse
            gsap.to(mobileDrawer, { height: 0, opacity: 0, duration: 0.3, ease: "apple-glass" });
            gsap.to(mainContent, { y: 0, duration: 0.3, ease: "apple-glass" }); // Reset content
            gsap.to(menuIconOpen, { rotation: 0, opacity: 1, duration: 0.3, transformOrigin: "50% 50%", ease: "apple-glass" });
            gsap.to(menuIconClose, { rotation: -90, opacity: 0, duration: 0.3, transformOrigin: "50% 50%", ease: "apple-glass" });
        }
    };

    menuBtn?.addEventListener('click', () => toggleMenu());

    // Search System
    const searchBtn = document.getElementById('search-trigger');
    const contentWrapper = document.getElementById('nav-content-wrapper');
    const searchUI = document.getElementById('nav-search-ui');
    const searchInput = document.getElementById('search-input');
    let isSearchActive = false;
    const toggleSearch = (forceClose = false) => {
        if (isMenuOpen) toggleMenu(true); 
        isSearchActive = forceClose ? false : !isSearchActive;
        
        const searchUI = document.getElementById('nav-search-ui');
        const iconOpen = document.getElementById('search-icon-open');
        const iconClose = document.getElementById('search-icon-close');
        
        // Lock the trigger precisely and kill any potential drift
        gsap.killTweensOf([contentWrapper, searchUI, iconOpen, iconClose, searchBtn]);
        gsap.set(searchBtn, { y: 0 }); 

        if (isSearchActive) {
            // Scroll to top so search results are at the start
            window.scrollTo({ top: 0, behavior: 'smooth' });

            // Immediate focus for mobile keyboard compatibility
            searchInput.focus();

            // Roll Out Branding, Links & Theme (All nested in wrapper)
            gsap.to(contentWrapper, { 
                y: -40, opacity: 0, duration: 0.4, ease: "apple-glass",
                onComplete: () => contentWrapper.style.pointerEvents = 'none'
            });
            // Reveal Search UI (Clean horizontal entry)
            gsap.to(searchUI, { 
                y: 0, opacity: 1, duration: 0.5, delay: 0.1, ease: "apple-glass", 
                onStart: () => {
                    searchUI.style.pointerEvents = 'auto';
                }
            });
            // Pure Icon Rotation (Locking Y)
            gsap.to(iconOpen, { rotation: 90, opacity: 0, scale: 0.8, y: 0, transformOrigin: "50% 50%", duration: 0.3, ease: "apple-glass" });
            gsap.set(iconClose, { rotation: -90, opacity: 0, scale: 0.8, y: 0, transformOrigin: "50% 50%" });
            gsap.to(iconClose, { rotation: 0, opacity: 1, scale: 1, y: 0, duration: 0.3, delay: 0.05, ease: "apple-glass" });
        } else {
            // Hide Search UI
            gsap.to(searchUI, { 
                y: 10, opacity: 0, duration: 0.3, ease: "apple-glass", 
                onComplete: () => {
                    searchUI.style.pointerEvents = 'none';
                }
            });
            // Restore Branding, Links & Theme
            gsap.to(contentWrapper, { 
                y: 0, opacity: 1, duration: 0.5, delay: 0.2, ease: "apple-glass", 
                onStart: () => {
                    contentWrapper.style.pointerEvents = 'auto';
                    searchInput.value = '';
                    filterContent('all'); // Reset
                }
            });
            // Pure Icon Rotation (Locking Y)
            gsap.to(iconOpen, { rotation: 0, opacity: 1, scale: 1, y: 0, transformOrigin: "50% 50%", duration: 0.3, delay: 0.05, ease: "apple-glass" });
            gsap.to(iconClose, { rotation: -90, opacity: 0, scale: 0.8, y: 0, transformOrigin: "50% 50%", duration: 0.3, ease: "apple-glass" });
        }
    };

    searchBtn?.addEventListener('click', () => toggleSearch());
    
    // Categorization Integration
    document.querySelectorAll('.nav-link, .nav-link-mobile').forEach(link => {
        link.addEventListener('click', () => {
            filterContent(link.dataset.category);
            if (isMenuOpen) toggleMenu(true);
        });
    });
    
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        state.filteredPosts = query.length > 0 
            ? state.posts.filter(p => p.title.toLowerCase().includes(query) || p.content.toLowerCase().includes(query))
            : [...state.posts];
        
        renderPosts();
        initScrollAnimations();
        ScrollTrigger.refresh();
    });

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') toggleSearch(true);
        if (e.key === 'Enter') searchInput.blur();
    });
}

function initTheme() {
    const toggle = document.getElementById('theme-toggle');
    if (!toggle) return;

    toggle.addEventListener('click', () => {
        document.documentElement.classList.toggle('dark-mode');
        localStorage.theme = document.documentElement.classList.contains('dark-mode') ? 'dark' : 'light';
    });

    // Scroll Rotation (High-Performance Ticker version)
    gsap.ticker.add(() => {
        const toggle = document.getElementById('theme-toggle');
        if (!toggle) return;
        const scrollPosition = window.pageYOffset || document.documentElement.scrollTop;
        const rotationAmount = scrollPosition * 0.15; // 0.15 degree per pixel scrolled
        gsap.set(toggle, { rotation: rotationAmount, overwrite: true });
    });
}

function openPost(card) {
    if (card.classList.contains('active')) return;
    
    // Disable interaction during transition
    card.style.pointerEvents = 'none';
    
    // Update hash for deep linking
    history.replaceState(null, null, "#" + card.id);
    
    const content = card.querySelector('.article-content');
    const prose = content.querySelector('.prose-body');
    const previews = card.querySelectorAll('.article-preview-wrap');
    
    // 1. Capture current state
    const stateContext = Flip.getState(card, { props: "borderRadius,backgroundColor" });
    
    // 2. Hide peers immediately
    document.querySelectorAll('.article-card').forEach(c => { if (c !== card) c.style.display = 'none'; });
    
    // 3. Swap content instantly (before Flip)
    card.classList.add('active');
    gsap.set(card, { backgroundColor: 'var(--glass-bg)' }); // Revert hover color for expansion
    previews.forEach(p => p.classList.add('hidden'));
    content.classList.remove('hidden');
    gsap.set(content, { opacity: 1 });
    gsap.set(prose, { opacity: 1 }); // Reveal text immediately so it 'slides' into view
    
    // 4. Animate the growth (The 'Slide Down' reveal)
    Flip.from(stateContext, { 
        duration: 0.8, 
        ease: "expo.out",
        scale: false,
        onComplete: () => {
            const contentLines = content.querySelectorAll('.tracing-line');
            gsap.to(contentLines, { scaleX: 1, duration: 1.5, ease: "power3.inOut" });
            window.scrollTo({ top: 0, behavior: 'smooth' });
            card.style.pointerEvents = 'auto'; // Restore interaction
        }
    });
}

function closePost(event) {
    event.stopPropagation();
    const activeCard = document.querySelector('.article-card.active');
    if (!activeCard) return;

    const content = activeCard.querySelector('.article-content');
    const previews = activeCard.querySelectorAll('.article-preview-wrap');

    // 1. Capture the expanded state before layout changes
    const closeFlipState = Flip.getState(activeCard, { props: "borderRadius,backgroundColor" });

    // 2. Immediate layout restoration (to grid state)
    content.classList.add('hidden');
    previews.forEach(p => {
        p.classList.remove('hidden');
        gsap.set(p, { opacity: 1 });
    });
    
    // Restore grid peers
    document.querySelectorAll('.article-card').forEach(c => { 
        c.style.display = 'block'; 
    });
    
    // Restore preview interaction
    activeCard.style.pointerEvents = 'auto';

    activeCard.classList.remove('active');

    // 3. Final Reveal
    const tl = gsap.timeline();
    tl.to(loader, { 
        opacity: 0, 
        duration: 0.8, 
        ease: "power2.inOut",
        onUpdate: () => {
            // Sync background ripple intensity with loader fade
            state.loaderIntensity = gsap.getProperty(loader, "opacity");
        },
        onComplete: () => {
            loader.style.display = 'none';
        }
    }, "-=0.2");

    // 4. Morph back (Shrink vertically)
    Flip.from(closeFlipState, {
        duration: 0.7,
        ease: "power3.inOut",
        onComplete: () => {
            // Clear hash
            history.replaceState(null, null, " ");
            ScrollTrigger.refresh();
        }
    });

    // Gentle fade out of the massive content block during the morph
    gsap.fromTo(content, { opacity: 1 }, { opacity: 0, duration: 0.2 });
}

function initDeepLinking() {
    const hash = window.location.hash.replace('#', '');
    if (!hash) return;
    
    const targetCard = document.getElementById(hash);
    if (targetCard) {
        // Find if we need to switch categories first
        const postData = state.posts.find(p => p.slug === hash);
        if (postData && postData.category !== state.currentCategory) {
            filterContent(postData.category);
            // Re-find card as DOM was regenerated
            const card = document.getElementById(hash);
            if (card) openPost(card);
        } else {
            openPost(targetCard);
        }
    }
}

function copyShareLink(slug, button, event) {
    event.stopPropagation();
    const url = window.location.origin + window.location.pathname + "#" + slug;
    
    navigator.clipboard.writeText(url).then(() => {
        const originalHTML = button.innerHTML;
        button.innerHTML = 'Link Copied! <span>✓</span>';
        
        // Add a temporary success class for visual feedback
        button.style.color = '#a78bfa'; // Soft Violet instead of Green
        
        setTimeout(() => {
            button.innerHTML = originalHTML;
            button.style.color = '';
        }, 2000);
    });
}
