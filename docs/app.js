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
        
        // Draw efficient gradient-based ripples
        this.drawGradientRipples(centerX, centerY, musicData);
        
        this.ctx.restore();
    }


    drawGradientRipples(centerX, centerY, musicData) {
        const { bassEnergy, midEnergy, trebleEnergy } = musicData;
        
        // Create multiple ripple layers with different speeds and colors
        this.drawRippleLayer(centerX, centerY, musicData, 0, this.time * 2, bassEnergy, 0);
        this.drawRippleLayer(centerX, centerY, musicData, 1, this.time * 1.3, midEnergy, Math.PI * 0.6);
        this.drawRippleLayer(centerX, centerY, musicData, 2, this.time * 0.8, trebleEnergy, Math.PI * 1.3);
    }

    drawRippleLayer(centerX, centerY, musicData, colorLayer, timeOffset, energy, phaseOffset) {
        const maxRadius = Math.max(this.canvas.width, this.canvas.height) * 0.8;
        const rippleCount = 6;
        const alpha = Math.max(0.02, Math.min(0.15, energy / 300));
        
        this.ctx.globalAlpha = alpha;
        
        for (let i = 0; i < rippleCount; i++) {
            const phase = timeOffset + i * Math.PI * 0.4 + phaseOffset;
            const radius = (Math.sin(phase) + 1) * 0.5 * maxRadius * 0.8 + maxRadius * 0.2;
            const innerRadius = radius * 0.7;
            
            // Create radial gradient
            const gradient = this.ctx.createRadialGradient(centerX, centerY, innerRadius, centerX, centerY, radius);
            const color = this.getPsychedelicColor(colorLayer, timeOffset + i, musicData);
            
            gradient.addColorStop(0, 'transparent');
            gradient.addColorStop(0.3, color);
            gradient.addColorStop(0.7, color);
            gradient.addColorStop(1, 'transparent');
            
            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            this.ctx.fill();
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