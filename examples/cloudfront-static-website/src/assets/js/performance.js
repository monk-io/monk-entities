/**
 * CloudFront Demo - Performance Monitoring Module
 * Advanced performance measurement and visualization
 */

class PerformanceMonitor {
    constructor() {
        this.metrics = {
            loadTimes: [],
            cacheHits: [],
            bandwidthSaved: 0,
            requests: []
        };
        
        this.chart = null;
        this.isInitialized = false;
    }

    /**
     * Initialize performance monitoring
     */
    init() {
        if (this.isInitialized) return;
        
        this.setupPerformanceObserver();
        this.measureInitialLoad();
        this.initChart();
        this.startPeriodicUpdates();
        
        this.isInitialized = true;
        console.log('Performance monitor initialized');
    }

    /**
     * Setup Performance Observer for detailed metrics
     */
    setupPerformanceObserver() {
        if ('PerformanceObserver' in window) {
            // Monitor navigation timing
            const navObserver = new PerformanceObserver((list) => {
                list.getEntries().forEach((entry) => {
                    this.processNavigationEntry(entry);
                });
            });
            navObserver.observe({ entryTypes: ['navigation'] });

            // Monitor resource timing
            const resourceObserver = new PerformanceObserver((list) => {
                list.getEntries().forEach((entry) => {
                    this.processResourceEntry(entry);
                });
            });
            resourceObserver.observe({ entryTypes: ['resource'] });

            // Monitor largest contentful paint
            const lcpObserver = new PerformanceObserver((list) => {
                list.getEntries().forEach((entry) => {
                    this.processLCPEntry(entry);
                });
            });
            lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
        }
    }

    /**
     * Process navigation timing entry
     */
    processNavigationEntry(entry) {
        const metrics = {
            dns: entry.domainLookupEnd - entry.domainLookupStart,
            tcp: entry.connectEnd - entry.connectStart,
            tls: entry.secureConnectionStart > 0 ? entry.connectEnd - entry.secureConnectionStart : 0,
            ttfb: entry.responseStart - entry.requestStart,
            download: entry.responseEnd - entry.responseStart,
            dom: entry.domContentLoadedEventEnd - entry.domContentLoadedEventStart,
            load: entry.loadEventEnd - entry.loadEventStart
        };

        console.log('Navigation metrics:', metrics);
        this.updateNavigationMetrics(metrics);
    }

    /**
     * Process resource timing entry
     */
    processResourceEntry(entry) {
        const resource = {
            name: entry.name,
            type: this.getResourceType(entry.name),
            size: entry.transferSize || 0,
            encodedSize: entry.encodedBodySize || 0,
            duration: entry.duration,
            cached: entry.transferSize === 0 && entry.encodedBodySize > 0
        };

        // Calculate compression savings
        if (resource.encodedSize > 0 && resource.size > 0) {
            const compressionSavings = resource.encodedSize - resource.size;
            if (compressionSavings > 0) {
                this.metrics.bandwidthSaved += compressionSavings;
            }
        }

        // Track cache hits
        if (resource.cached || entry.transferSize < entry.encodedBodySize * 0.1) {
            this.metrics.cacheHits.push(true);
        } else {
            this.metrics.cacheHits.push(false);
        }

        this.metrics.requests.push(resource);
        this.updateResourceMetrics();
    }

    /**
     * Process Largest Contentful Paint entry
     */
    processLCPEntry(entry) {
        console.log('LCP:', Math.round(entry.startTime), 'ms');
        this.updateMetric('lcp-time', Math.round(entry.startTime));
    }

    /**
     * Get resource type from URL
     */
    getResourceType(url) {
        if (url.includes('.css')) return 'CSS';
        if (url.includes('.js')) return 'JavaScript';
        if (url.match(/\.(jpg|jpeg|png|gif|svg|webp)$/i)) return 'Image';
        if (url.includes('.html')) return 'HTML';
        if (url.includes('font')) return 'Font';
        return 'Other';
    }

    /**
     * Measure initial page load
     */
    measureInitialLoad() {
        window.addEventListener('load', () => {
            setTimeout(() => {
                const perfData = performance.getEntriesByType('navigation')[0];
                if (perfData) {
                    const loadTime = Math.round(perfData.loadEventEnd - perfData.fetchStart);
                    this.metrics.loadTimes.push(loadTime);
                    this.updateLoadTimeDisplay(loadTime);
                }
            }, 100);
        });
    }

    /**
     * Update navigation metrics display
     */
    updateNavigationMetrics(metrics) {
        // Create or update navigation breakdown chart
        this.updateNavigationChart(metrics);
    }

    /**
     * Update resource metrics
     */
    updateResourceMetrics() {
        // Calculate cache hit ratio
        const totalRequests = this.metrics.cacheHits.length;
        const hitCount = this.metrics.cacheHits.filter(hit => hit).length;
        const hitRatio = totalRequests > 0 ? Math.round((hitCount / totalRequests) * 100) : 0;

        this.updateMetric('cache-hit-ratio', hitRatio + '%');

        // Update bandwidth saved
        const savedKB = Math.round(this.metrics.bandwidthSaved / 1024);
        this.updateMetric('bandwidth-saved', savedKB + 'KB');

        // Update request count
        this.updateMetric('total-requests', totalRequests);
    }

    /**
     * Update load time display
     */
    updateLoadTimeDisplay(loadTime) {
        this.updateMetric('load-time', loadTime + 'ms');
        
        // Add to load times array for trending
        this.metrics.loadTimes.push(loadTime);
        if (this.metrics.loadTimes.length > 10) {
            this.metrics.loadTimes.shift(); // Keep only last 10 measurements
        }

        this.updateChart();
    }

    /**
     * Initialize performance chart
     */
    initChart() {
        const canvas = document.getElementById('performance-chart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        this.setupChart(ctx);
    }

    /**
     * Setup chart with initial data
     */
    setupChart(ctx) {
        // Simple chart implementation without external dependencies
        this.chart = {
            canvas: ctx.canvas,
            ctx: ctx,
            data: {
                labels: ['DNS', 'TCP', 'TLS', 'TTFB', 'Download', 'DOM', 'Load'],
                values: [10, 20, 5, 150, 100, 50, 30] // Sample data
            }
        };

        this.drawChart();
    }

    /**
     * Draw performance chart
     */
    drawChart() {
        if (!this.chart) return;

        const { ctx, canvas, data } = this.chart;
        const width = canvas.width;
        const height = canvas.height;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        // Set up chart dimensions
        const margin = 60;
        const chartWidth = width - margin * 2;
        const chartHeight = height - margin * 2;
        const barWidth = chartWidth / data.labels.length;
        const maxValue = Math.max(...data.values);

        // Draw background
        ctx.fillStyle = '#f8f9fa';
        ctx.fillRect(0, 0, width, height);

        // Draw bars
        data.values.forEach((value, index) => {
            const barHeight = (value / maxValue) * chartHeight;
            const x = margin + index * barWidth + 10;
            const y = margin + chartHeight - barHeight;

            // Bar color based on performance
            ctx.fillStyle = value > 100 ? '#ff6b6b' : value > 50 ? '#ffd93d' : '#6bcf7f';
            ctx.fillRect(x, y, barWidth - 20, barHeight);

            // Value labels
            ctx.fillStyle = '#333';
            ctx.font = '12px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(value + 'ms', x + (barWidth - 20) / 2, y - 5);

            // Category labels
            ctx.fillText(data.labels[index], x + (barWidth - 20) / 2, margin + chartHeight + 20);
        });

        // Chart title
        ctx.fillStyle = '#333';
        ctx.font = 'bold 16px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Performance Breakdown', width / 2, 30);

        // Y-axis labels
        ctx.fillStyle = '#666';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'right';
        for (let i = 0; i <= 5; i++) {
            const value = Math.round((maxValue / 5) * i);
            const y = margin + chartHeight - (i / 5) * chartHeight;
            ctx.fillText(value + 'ms', margin - 10, y + 3);
        }
    }

    /**
     * Update navigation chart with real data
     */
    updateNavigationChart(metrics) {
        if (this.chart) {
            this.chart.data.values = [
                Math.round(metrics.dns),
                Math.round(metrics.tcp),
                Math.round(metrics.tls),
                Math.round(metrics.ttfb),
                Math.round(metrics.download),
                Math.round(metrics.dom),
                Math.round(metrics.load)
            ];
            this.drawChart();
        }
    }

    /**
     * Update chart with new data
     */
    updateChart() {
        if (this.chart && this.metrics.loadTimes.length > 0) {
            // For now, just redraw with current data
            this.drawChart();
        }
    }

    /**
     * Update metric display
     */
    updateMetric(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = value;
            element.classList.add('metric-updated');
            setTimeout(() => {
                element.classList.remove('metric-updated');
            }, 1000);
        }
    }

    /**
     * Start periodic updates
     */
    startPeriodicUpdates() {
        setInterval(() => {
            this.updatePerformanceScores();
            this.simulateMetricVariations();
        }, 5000);
    }

    /**
     * Update performance scores
     */
    updatePerformanceScores() {
        const avgLoadTime = this.metrics.loadTimes.length > 0 
            ? this.metrics.loadTimes.reduce((a, b) => a + b, 0) / this.metrics.loadTimes.length 
            : 0;

        const cacheHitRatio = this.getCacheHitRatio();
        
        // Calculate performance score based on metrics
        let score = 100;
        if (avgLoadTime > 3000) score -= 30;
        else if (avgLoadTime > 2000) score -= 20;
        else if (avgLoadTime > 1000) score -= 10;

        if (cacheHitRatio < 80) score -= 20;
        else if (cacheHitRatio < 90) score -= 10;

        const performanceScore = Math.max(0, Math.min(100, Math.round(score)));
        this.updateMetric('performance-score', performanceScore);
    }

    /**
     * Get current cache hit ratio
     */
    getCacheHitRatio() {
        if (this.metrics.cacheHits.length === 0) return 0;
        const hits = this.metrics.cacheHits.filter(hit => hit).length;
        return Math.round((hits / this.metrics.cacheHits.length) * 100);
    }

    /**
     * Simulate metric variations for demo
     */
    simulateMetricVariations() {
        // Simulate occasional cache misses
        if (Math.random() > 0.8) {
            this.metrics.cacheHits.push(Math.random() > 0.15);
            this.updateResourceMetrics();
        }

        // Simulate bandwidth savings
        if (Math.random() > 0.7) {
            this.metrics.bandwidthSaved += Math.random() * 1000;
            const savedKB = Math.round(this.metrics.bandwidthSaved / 1024);
            this.updateMetric('bandwidth-saved', savedKB + 'KB');
        }
    }

    /**
     * Get performance summary
     */
    getPerformanceSummary() {
        return {
            avgLoadTime: this.metrics.loadTimes.length > 0 
                ? Math.round(this.metrics.loadTimes.reduce((a, b) => a + b, 0) / this.metrics.loadTimes.length)
                : 0,
            cacheHitRatio: this.getCacheHitRatio(),
            bandwidthSaved: Math.round(this.metrics.bandwidthSaved / 1024),
            totalRequests: this.metrics.requests.length
        };
    }
}

// Initialize global performance monitor
window.performanceMonitor = new PerformanceMonitor();

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.performanceMonitor.init();
});

// Export for external access
window.PerformanceMonitor = PerformanceMonitor;
