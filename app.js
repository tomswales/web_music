class MusicVisualizerApp {
    constructor() {
        this.visualizer = document.getElementById('visualizer');
        this.channelMeters = document.getElementById('channelMeters');
        this.startBtn = document.getElementById('startBtn');
        this.status = document.getElementById('status');
        this.isRunning = false;
        
        this.initEventListeners();
        this.checkAutoStart();
    }

    initEventListeners() {
        this.startBtn.addEventListener('click', () => this.toggleVisualizer());
        
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.isRunning) {
                this.pauseVisualizer();
            }
        });
        
        window.addEventListener('beforeunload', () => {
            if (this.isRunning) {
                this.stopVisualizer();
            }
        });
    }

    async toggleVisualizer() {
        if (!this.isRunning) {
            await this.startVisualizer();
        } else {
            this.stopVisualizer();
        }
    }

    async startVisualizer() {
        try {
            this.updateStatus('Requesting microphone access...');
            this.startBtn.disabled = true;
            
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
            
            this.startBtn.textContent = 'STOP AUDIO';
            this.startBtn.classList.add('active');
            this.startBtn.disabled = false;
            this.updateStatus('Audio visualizer active');
            
            this.setPermissionGranted(true);
            
        } catch (error) {
            console.error('Error starting visualizer:', error);
            this.setPermissionGranted(false);
            this.handleError(error);
        }
    }

    stopVisualizer() {
        this.visualizer.stop();
        this.channelMeters.stop();
        this.isRunning = false;
        
        this.startBtn.textContent = 'START AUDIO';
        this.startBtn.classList.remove('active');
        this.startBtn.disabled = false;
        this.updateStatus('Audio visualizer stopped');
    }


    pauseVisualizer() {
        if (this.isRunning) {
            this.visualizer.stop();
            this.channelMeters.stop();
            this.updateStatus('Audio visualizer paused (tab hidden)');
        }
    }

    handleError(error) {
        this.startBtn.disabled = false;
        this.startBtn.textContent = 'START AUDIO';
        this.startBtn.classList.remove('active');
        
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
            this.updateStatus('Microphone access denied. Please grant permission and try again.');
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
            this.updateStatus('No microphone found. Please connect a microphone and try again.');
        } else if (error.name === 'NotSupportedError') {
            this.updateStatus('Audio capture not supported in this browser.');
        } else {
            this.updateStatus('Error accessing microphone. Check console for details.');
        }
    }

    async checkAutoStart() {
        try {
            const hasPermission = this.getPermissionGranted();
            if (!hasPermission) return;

            const permissionStatus = await navigator.permissions.query({name: 'microphone'});
            
            if (permissionStatus.state === 'granted') {
                this.updateStatus('Auto-starting with saved permission...');
                setTimeout(() => this.startVisualizer(), 500);
            } else {
                this.setPermissionGranted(false);
            }

            permissionStatus.onchange = () => {
                if (permissionStatus.state === 'denied' || permissionStatus.state === 'prompt') {
                    this.setPermissionGranted(false);
                    if (this.isRunning) {
                        this.stopVisualizer();
                        this.updateStatus('Microphone permission revoked');
                    }
                }
            };
        } catch (error) {
            console.warn('Could not check microphone permissions:', error);
        }
    }

    setPermissionGranted(granted) {
        try {
            localStorage.setItem('microphonePermissionGranted', granted.toString());
        } catch (error) {
            console.warn('Could not save permission status:', error);
        }
    }

    getPermissionGranted() {
        try {
            return localStorage.getItem('microphonePermissionGranted') === 'true';
        } catch (error) {
            console.warn('Could not read permission status:', error);
            return false;
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
}

document.addEventListener('DOMContentLoaded', () => {
    new MusicVisualizerApp();
});