class MusicVisualizerApp {
    constructor() {
        this.visualizer = document.getElementById('visualizer');
        this.channelMeters = document.getElementById('channelMeters');
        this.status = document.getElementById('status');
        this.fullscreenBtn = document.getElementById('fullscreenBtn');
        this.isRunning = false;
        
        this.createBackgroundCanvas();
        this.initEventListeners();
        this.attemptAutoStart();
    }

    initEventListeners() {
        document.addEventListener('click', () => {
            if (!this.isRunning) {
                this.startVisualizer();
            }
        }, { once: true });
        
        this.fullscreenBtn.addEventListener('click', () => this.enterFullscreen());
        
        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement) {
                document.body.classList.remove('fullscreen-mode');
            }
        });
        
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.isRunning) {
                this.pauseVisualizer();
            } else if (!document.hidden && this.isRunning) {
                this.resumeVisualizer();
            }
        });
        
        window.addEventListener('beforeunload', () => {
            if (this.isRunning) {
                this.stopVisualizer();
            }
        });
    }

    async attemptAutoStart() {
        try {
            await this.startVisualizer();
        } catch (error) {
            this.updateStatus('Click anywhere to start audio visualizer');
        }
    }


    async startVisualizer() {
        try {
            this.updateStatus('Requesting microphone access...');
            
            const success = await this.visualizer.initAudio();
            
            if (!success) {
                throw new Error('Failed to initialize audio');
            }
            
            const channelSuccess = this.channelMeters.initAudio(
                this.visualizer.audioContext, 
                this.visualizer.microphone
            );
            
            if (!channelSuccess) {
                throw new Error('Failed to initialize channel meters');
            }
            
            this.visualizer.start();
            this.channelMeters.start();
            this.isRunning = true;
            
            this.updateStatus('Audio visualizer active');
            
        } catch (error) {
            console.error('Error starting visualizer:', error);
            this.handleError(error);
        }
    }

    stopVisualizer() {
        this.visualizer.stop();
        this.channelMeters.stop();
        this.isRunning = false;
        
        if (this.backgroundAnimationId) {
            cancelAnimationFrame(this.backgroundAnimationId);
            this.backgroundAnimationId = null;
        }
        
        this.updateStatus('Audio visualizer stopped');
    }

    async enterFullscreen() {
        try {
            await document.documentElement.requestFullscreen();
            document.body.classList.add('fullscreen-mode');
        } catch (error) {
            console.error('Error entering fullscreen:', error);
            this.updateStatus('Fullscreen not supported in this browser');
        }
    }

    pauseVisualizer() {
        if (this.isRunning) {
            this.visualizer.stop();
            this.channelMeters.stop();
            this.updateStatus('Audio visualizer paused (tab hidden)');
        }
    }

    resumeVisualizer() {
        if (this.isRunning) {
            this.visualizer.start();
            this.channelMeters.start();
            this.updateStatus('Audio visualizer active');
        }
    }

    handleError(error) {
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
            this.updateStatus('Microphone access denied. Please grant permission and refresh.');
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
            this.updateStatus('No microphone found. Please connect a microphone and refresh.');
        } else if (error.name === 'NotSupportedError') {
            this.updateStatus('Audio capture not supported in this browser.');
        } else {
            this.updateStatus('Error accessing microphone. Check console for details.');
        }
    }



    updateStatus(message) {
        this.status.textContent = message;
        
        if (message.includes('Error') || message.includes('denied') || message.includes('not found')) {
            this.status.style.color = '#ff4444';
            this.status.style.borderColor = '#ff4444';
        } else if (message.includes('active')) {
            this.status.style.color = '#00ff41';
            this.status.style.borderColor = '#00ff41';
        } else {
            this.status.style.color = '#ffaa00';
            this.status.style.borderColor = 'rgba(255, 170, 0, 0.3)';
        }
    }

    createBackgroundCanvas() {
        this.backgroundCanvas = document.createElement('canvas');
        this.backgroundCanvas.id = 'psychedelic-background';
        this.backgroundCanvas.style.position = 'fixed';
        this.backgroundCanvas.style.top = '0';
        this.backgroundCanvas.style.left = '0';
        this.backgroundCanvas.style.width = '100vw';
        this.backgroundCanvas.style.height = '100vh';
        this.backgroundCanvas.style.zIndex = '-1';
        this.backgroundCanvas.style.pointerEvents = 'none';
        this.backgroundCanvas.style.backgroundColor = 'rgb(5, 5, 5)';
        
        document.body.insertBefore(this.backgroundCanvas, document.body.firstChild);
        
        this.backgroundCtx = this.backgroundCanvas.getContext('2d');
        this.setupBackgroundCanvas();
        
        window.addEventListener('resize', () => this.setupBackgroundCanvas());
        
        this.backgroundRenderer = new PsychedelicBackground(this.backgroundCanvas, this.backgroundCtx);
        this.startBackgroundAnimation();
    }

    setupBackgroundCanvas() {
        this.backgroundCanvas.width = window.innerWidth;
        this.backgroundCanvas.height = window.innerHeight;
    }

    getVisualizerData() {
        if (this.visualizer && this.visualizer.isRunning) {
            return {
                musicEnergy: this.visualizer.musicEnergy || 0,
                bassEnergy: this.visualizer.bassEnergy || 0,
                midEnergy: this.visualizer.midEnergy || 0,
                trebleEnergy: this.visualizer.trebleEnergy || 0
            };
        }
        return { musicEnergy: 0, bassEnergy: 0, midEnergy: 0, trebleEnergy: 0 };
    }

    startBackgroundAnimation() {
        let lastTime = 0;
        const targetFPS = 30; // Limit to 30 FPS for performance
        const frameInterval = 1000 / targetFPS;
        
        const animateBackground = (currentTime) => {
            if (currentTime - lastTime >= frameInterval) {
                const musicData = this.getVisualizerData();
                this.backgroundRenderer.render(musicData);
                lastTime = currentTime;
            }
            this.backgroundAnimationId = requestAnimationFrame(animateBackground);
        };
        this.backgroundAnimationId = requestAnimationFrame(animateBackground);
    }
}

class PsychedelicBackground {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.time = 0;
        this.triangleSegments = [];
    }

    render(musicData) {
        // Always render something for debugging visibility
        const { musicEnergy, bassEnergy, midEnergy, trebleEnergy } = musicData;
        const totalEnergy = musicEnergy + bassEnergy + midEnergy + trebleEnergy;
        
        // Make background always black for now to debug visibility
        this.ctx.fillStyle = 'rgb(0, 0, 0)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Always show a basic pattern, even without audio
        // Skip complex rendering if no significant audio
        // if (totalEnergy < 5) {
        //     return;
        // }
        
        this.time += 0.005 + (musicEnergy / 8000);
        
        this.ctx.save();
        // Temporarily high alpha for debugging visibility
        this.ctx.globalAlpha = Math.max(0.8, 0.6 + (musicEnergy / 500));
        
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        
        // Draw giant static Sierpinski with beat-reactive waves
        this.drawGiantSierpinskiWithWaves(centerX, centerY, musicData);
        
        this.ctx.restore();
    }

    drawFractalTree(centerX, centerY, musicData) {
        const { bassEnergy, midEnergy, trebleEnergy, musicEnergy } = musicData;
        const maxDepth = 8;
        const baseLength = Math.min(this.canvas.width, this.canvas.height) * 0.1;
        const angle = this.time * 0.3 + (bassEnergy / 100);
        
        this.ctx.strokeStyle = this.getPsychedelicColor(0, this.time, musicData);
        this.ctx.lineWidth = 1 + (musicEnergy / 200);
        
        // Draw multiple trees from different points
        for (let i = 0; i < 6; i++) {
            const treeX = centerX + Math.cos(i * Math.PI / 3) * (centerX * 0.6);
            const treeY = centerY + Math.sin(i * Math.PI / 3) * (centerY * 0.6);
            this.drawTreeBranch(treeX, treeY, baseLength, angle + i * 0.5, maxDepth, musicData);
        }
    }

    drawTreeBranch(x, y, length, angle, depth, musicData) {
        if (depth <= 0 || length < 1) return;
        
        const { midEnergy, trebleEnergy } = musicData;
        const endX = x + Math.cos(angle) * length;
        const endY = y + Math.sin(angle) * length;
        
        this.ctx.beginPath();
        this.ctx.moveTo(x, y);
        this.ctx.lineTo(endX, endY);
        this.ctx.stroke();
        
        // Recursive branching with music influence
        const branchAngle1 = angle + 0.5 + (trebleEnergy / 200);
        const branchAngle2 = angle - 0.5 - (midEnergy / 200);
        const newLength = length * (0.7 + Math.sin(this.time + depth) * 0.1);
        
        this.drawTreeBranch(endX, endY, newLength, branchAngle1, depth - 1, musicData);
        this.drawTreeBranch(endX, endY, newLength, branchAngle2, depth - 1, musicData);
    }

    drawGiantSierpinskiWithWaves(centerX, centerY, musicData) {
        const { bassEnergy, midEnergy, trebleEnergy, musicEnergy } = musicData;
        
        // Giant triangle with smooth cyclical size changes only
        const baseSize = Math.max(this.canvas.width, this.canvas.height) * 1.6;
        const smoothPulsation = Math.sin(this.time * 0.5) * 0.1; // Gentle size cycling
        const pulsation = 1 + smoothPulsation;
        const size = baseSize * pulsation;
        const maxDepth = 10;
        
        // Store all line segments for wave animation
        this.triangleSegments = [];
        
        // Position triangle higher to cover top half - move up by 45% of screen height
        const adjustedCenterY = centerY - (this.canvas.height * 0.45);
        
        // Draw the structure with pulsation and smooth rotation
        const rotationAngle = this.time * 0.02; // Very slow rotation
        this.buildSierpinskiSegmentsRotated(centerX, adjustedCenterY, size, maxDepth, rotationAngle);
        
        // Now draw with extreme beat-reactive colors and waves
        const beatStrength = Math.max(0.4, (bassEnergy + midEnergy * 0.8) / 60);
        const fastWaveSpeed = this.time * 4;
        const slowWaveSpeed = this.time * 1.5;
        
        for (let i = 0; i < this.triangleSegments.length; i++) {
            const segment = this.triangleSegments[i];
            
            // Calculate distance from adjusted center for wave effect
            const midX = (segment.x1 + segment.x2) / 2;
            const midY = (segment.y1 + segment.y2) / 2;
            const distanceFromCenter = Math.sqrt((midX - centerX) ** 2 + (midY - adjustedCenterY) ** 2);
            
            // Multiple overlapping wave patterns for extreme movement
            const fastWave = distanceFromCenter * 0.02 - fastWaveSpeed;
            const slowWave = distanceFromCenter * 0.008 - slowWaveSpeed;
            const spiralWave = Math.atan2(midY - adjustedCenterY, midX - centerX) * 2 + this.time * 3;
            
            // Combine multiple wave types for extreme cycling
            const wave1 = (Math.sin(fastWave) + 1) * 0.5;
            const wave2 = (Math.sin(slowWave) + 1) * 0.5;
            const wave3 = (Math.sin(spiralWave) + 1) * 0.5;
            const combinedWave = (wave1 + wave2 + wave3) / 3;
            
            const waveIntensity = Math.max(0.1, combinedWave * beatStrength);
            
            // Extreme color cycling based on multiple frequency bands and waves
            let colorLayer = 0;
            const colorCycle = (this.time * 2 + distanceFromCenter * 0.01) % (Math.PI * 2);
            
            if (bassEnergy > 15 && wave1 > 0.6) colorLayer = 0; // Bass wave = purple/magenta
            else if (midEnergy > 15 && wave2 > 0.5) colorLayer = 1; // Mid wave = teal/blue
            else if (trebleEnergy > 15 && wave3 > 0.4) colorLayer = 2; // Treble wave = green/yellow
            else {
                // Cycling through colors when no dominant frequency
                if (colorCycle < Math.PI * 2/3) colorLayer = 0;
                else if (colorCycle < Math.PI * 4/3) colorLayer = 1;
                else colorLayer = 2;
            }
            
            // Very subtle patterns to avoid clashing with visualizations
            const alpha = Math.max(0.05, Math.min(0.3, waveIntensity * 0.8));
            this.ctx.globalAlpha = alpha;
            this.ctx.strokeStyle = this.getPsychedelicColor(colorLayer, this.time * 2 + distanceFromCenter * 0.01, musicData);
            this.ctx.lineWidth = 0.4 + waveIntensity * 3 + (beatStrength * 2);
            
            // Draw the segment
            this.ctx.beginPath();
            this.ctx.moveTo(segment.x1, segment.y1);
            this.ctx.lineTo(segment.x2, segment.y2);
            this.ctx.stroke();
        }
    }

    buildSierpinskiSegments(x, y, size, depth) {
        if (depth <= 0) return;
        
        const height = size * Math.sqrt(3) / 2;
        
        // Triangle vertices (static, no rotation)
        const x1 = x - size / 2;
        const y1 = y + height / 2;
        const x2 = x + size / 2;
        const y2 = y + height / 2;
        const x3 = x;
        const y3 = y - height / 2;
        
        if (depth === 1) {
            // Store the three edges as line segments
            this.triangleSegments.push({x1: x1, y1: y1, x2: x2, y2: y2}); // bottom edge
            this.triangleSegments.push({x1: x2, y1: y2, x2: x3, y2: y3}); // right edge
            this.triangleSegments.push({x1: x3, y1: y3, x2: x1, y2: y1}); // left edge
        } else {
            // Recursive subdivision
            this.buildSierpinskiSegments((x1 + x3) / 2, (y1 + y3) / 2, size / 2, depth - 1);
            this.buildSierpinskiSegments((x2 + x3) / 2, (y2 + y3) / 2, size / 2, depth - 1);
            this.buildSierpinskiSegments((x1 + x2) / 2, (y1 + y2) / 2, size / 2, depth - 1);
        }
    }

    buildSierpinskiSegmentsRotated(x, y, size, depth, rotation = 0) {
        if (depth <= 0) return;
        
        const height = size * Math.sqrt(3) / 2;
        
        // Triangle vertices before rotation
        const x1_base = x - size / 2;
        const y1_base = y + height / 2;
        const x2_base = x + size / 2;
        const y2_base = y + height / 2;
        const x3_base = x;
        const y3_base = y - height / 2;
        
        // Apply rotation around center point (x, y)
        const cos_r = Math.cos(rotation);
        const sin_r = Math.sin(rotation);
        
        const x1 = x + (x1_base - x) * cos_r - (y1_base - y) * sin_r;
        const y1 = y + (x1_base - x) * sin_r + (y1_base - y) * cos_r;
        const x2 = x + (x2_base - x) * cos_r - (y2_base - y) * sin_r;
        const y2 = y + (x2_base - x) * sin_r + (y2_base - y) * cos_r;
        const x3 = x + (x3_base - x) * cos_r - (y3_base - y) * sin_r;
        const y3 = y + (x3_base - x) * sin_r + (y3_base - y) * cos_r;
        
        if (depth === 1) {
            // Store the three edges as line segments
            this.triangleSegments.push({x1: x1, y1: y1, x2: x2, y2: y2}); // bottom edge
            this.triangleSegments.push({x1: x2, y1: y2, x2: x3, y2: y3}); // right edge
            this.triangleSegments.push({x1: x3, y1: y3, x2: x1, y2: y1}); // left edge
        } else {
            // Recursive subdivision with rotation
            this.buildSierpinskiSegmentsRotated((x1 + x3) / 2, (y1 + y3) / 2, size / 2, depth - 1, rotation);
            this.buildSierpinskiSegmentsRotated((x2 + x3) / 2, (y2 + y3) / 2, size / 2, depth - 1, rotation);
            this.buildSierpinskiSegmentsRotated((x1 + x2) / 2, (y1 + y2) / 2, size / 2, depth - 1, rotation);
        }
    }

    drawJuliaSetVariation(centerX, centerY, musicData) {
        const { bassEnergy, midEnergy, trebleEnergy } = musicData;
        const maxIter = 20;
        const zoom = 100 + (bassEnergy * 2);
        
        this.ctx.strokeStyle = this.getPsychedelicColor(2, this.time * 0.8, musicData);
        this.ctx.lineWidth = 0.5;
        
        // Julia set parameters that change with music
        const cx = -0.7 + Math.sin(this.time * 0.1) * 0.3 + (midEnergy / 1000);
        const cy = 0.27 + Math.cos(this.time * 0.15) * 0.3 + (trebleEnergy / 1000);
        
        // Sample points in a grid pattern
        const step = 8; // Larger step for performance
        for (let px = -this.canvas.width / 2; px < this.canvas.width / 2; px += step) {
            for (let py = -this.canvas.height / 2; py < this.canvas.height / 2; py += step) {
                const x0 = px / zoom;
                const y0 = py / zoom;
                
                let x = x0, y = y0;
                let iter = 0;
                
                while (x * x + y * y <= 4 && iter < maxIter) {
                    const xtemp = x * x - y * y + cx;
                    y = 2 * x * y + cy;
                    x = xtemp;
                    iter++;
                }
                
                // Only draw boundary points for subtle effect
                if (iter > 5 && iter < maxIter - 2) {
                    const plotX = centerX + px;
                    const plotY = centerY + py;
                    
                    this.ctx.beginPath();
                    this.ctx.arc(plotX, plotY, 1.2, 0, Math.PI * 2);
                    this.ctx.stroke();
                }
            }
        }
    }

    getPsychedelicColor(layer, time, musicData) {
        const { bassEnergy, midEnergy, trebleEnergy } = musicData;
        const bassInfluence = bassEnergy / 100;
        const midInfluence = midEnergy / 100;
        const trebleInfluence = trebleEnergy / 100;
        
        // More visible but still muted color palette
        let r, g, b;
        
        switch (layer % 3) {
            case 0:
                // Deep purple/magenta - more visible
                r = Math.floor(40 + Math.sin(time) * 20 + bassInfluence * 15);
                g = Math.floor(10 + Math.sin(time * 1.3) * 15 + midInfluence * 10);
                b = Math.floor(50 + Math.sin(time * 0.8) * 25 + trebleInfluence * 20);
                break;
            case 1:
                // Dark teal/blue - more visible
                r = Math.floor(10 + Math.sin(time * 1.1) * 15 + midInfluence * 12);
                g = Math.floor(30 + Math.sin(time * 0.9) * 20 + trebleInfluence * 15);
                b = Math.floor(60 + Math.sin(time * 1.4) * 25 + bassInfluence * 18);
                break;
            default:
                // Dark green/yellow - more visible
                r = Math.floor(20 + Math.sin(time * 0.7) * 15 + trebleInfluence * 10);
                g = Math.floor(40 + Math.sin(time * 1.2) * 20 + bassInfluence * 15);
                b = Math.floor(15 + Math.sin(time * 1.6) * 10 + midInfluence * 12);
                break;
        }
        
        // Temporarily bright colors for debugging visibility
        r = Math.min(200, Math.max(100, r * 3));
        g = Math.min(200, Math.max(100, g * 3));
        b = Math.min(200, Math.max(100, b * 3));
        
        return `rgb(${r}, ${g}, ${b})`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new MusicVisualizerApp();
});