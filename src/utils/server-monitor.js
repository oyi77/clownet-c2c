const os = require('os');

class ServerMonitor {
  constructor() {
    this.startTime = Date.now();
    this.lastCpuUsage = process.cpuUsage();
    this.lastCpuCheck = Date.now();
    this.cpuPercent = 0;
    this.ramPercent = 0;

    this.interval = setInterval(() => this.updateStats(), 5000);
    this.updateStats();
  }

  updateStats() {
    const currentUsage = process.cpuUsage(this.lastCpuUsage);
    const currentTime = Date.now();
    const elapsedTime = (currentTime - this.lastCpuCheck) / 1000;
    
    const totalUsageMicroseconds = currentUsage.user + currentUsage.system;
    const totalUsageSeconds = totalUsageMicroseconds / 1000000;
    const cpuUsageRatio = totalUsageSeconds / elapsedTime / os.cpus().length;
    this.cpuPercent = Math.min(100, Math.round(cpuUsageRatio * 100));
    
    this.lastCpuUsage = process.cpuUsage();
    this.lastCpuCheck = currentTime;

    const totalMem = os.totalmem();
    const usedMem = totalMem - os.freemem();
    this.ramPercent = Math.round((usedMem / totalMem) * 100);
  }

  getStats() {
    return {
      cpu_percent: this.cpuPercent,
      ram_percent: this.ramPercent,
      uptime: process.uptime(),
      hostname: os.hostname(),
      platform: os.platform(),
      version: process.env.npm_package_version || '3.5.0',
      memory_usage: process.memoryUsage(),
      pid: process.pid
    };
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

const monitor = new ServerMonitor();

module.exports = {
  getServerStats: () => monitor.getStats(),
  stopMonitoring: () => monitor.stop()
};
