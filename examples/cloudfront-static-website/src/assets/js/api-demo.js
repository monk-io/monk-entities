/**
 * CloudFront Demo - API Integration Module
 * Demonstrates CloudFront behavior with API calls
 */

class APIDemo {
    constructor() {
        this.requestHistory = [];
        this.mockApiBase = '/api/v1'; // Would be actual API in production
        this.metricsTable = null;
    }

    /**
     * Initialize API demo features
     */
    init() {
        this.setupMockEndpoints();
        this.initMetricsTable();
        console.log('API Demo initialized');
    }

    /**
     * Setup mock API endpoints for demonstration
     */
    setupMockEndpoints() {
        // In a real implementation, these would be actual API endpoints
        // For demo purposes, we'll simulate API responses
        this.mockEndpoints = {
            '/api/v1/static': {
                cacheable: true,
                data: {
                    message: 'This is cached static data',
                    timestamp: new Date().toISOString(),
                    version: '1.0.0',
                    cache_policy: 'max-age=300',
                    features: [
                        'Global CDN',
                        'Edge Caching',
                        'Compression',
                        'SSL/TLS'
                    ]
                }
            },
            '/api/v1/dynamic': {
                cacheable: false,
                data: {
                    message: 'This is dynamic, non-cached data',
                    user_id: Math.random().toString(36).substr(2, 9),
                    session_id: Math.random().toString(36).substr(2, 16),
                    timestamp: new Date().toISOString(),
                    cache_policy: 'no-cache',
                    random_value: Math.random()
                }
            }
        };
    }

    /**
     * Initialize metrics table
     */
    initMetricsTable() {
        this.metricsTable = document.getElementById('api-metrics-body');
        if (this.metricsTable) {
            this.updateMetricsTable();
        }
    }

    /**
     * Test cached API endpoint
     */
    async testCachedAPI() {
        const resultDiv = document.getElementById('cached-api-result');
        if (!resultDiv) return;

        resultDiv.innerHTML = '<div class="loading">Making API request...</div>';

        try {
            const startTime = performance.now();
            const response = await this.makeAPICall('/api/v1/static', true);
            const endTime = performance.now();
            const duration = Math.round(endTime - startTime);

            // Simulate CloudFront headers
            const headers = {
                'x-cache': Math.random() > 0.3 ? 'Hit from cloudfront' : 'Miss from cloudfront',
                'x-amz-cf-pop': 'IAD89-C1',
                'cache-control': 'public, max-age=300',
                'content-encoding': 'gzip'
            };

            this.recordRequest({
                endpoint: '/api/v1/static',
                type: 'Cached API',
                duration: duration,
                cacheStatus: headers['x-cache'],
                edgeLocation: headers['x-amz-cf-pop']
            });

            resultDiv.innerHTML = this.formatAPIResponse(response, headers, duration);
            this.updateMetricsTable();

        } catch (error) {
            resultDiv.innerHTML = `<div style="color: #dc3545;">Error: ${error.message}</div>`;
        }
    }

    /**
     * Test dynamic API endpoint
     */
    async testDynamicAPI() {
        const resultDiv = document.getElementById('dynamic-api-result');
        if (!resultDiv) return;

        resultDiv.innerHTML = '<div class="loading">Making API request...</div>';

        try {
            const startTime = performance.now();
            const response = await this.makeAPICall('/api/v1/dynamic', false);
            const endTime = performance.now();
            const duration = Math.round(endTime - startTime);

            // Simulate CloudFront headers for non-cached content
            const headers = {
                'x-cache': 'Miss from cloudfront',
                'x-amz-cf-pop': 'IAD89-C1',
                'cache-control': 'no-cache, no-store, must-revalidate',
                'content-encoding': 'gzip'
            };

            this.recordRequest({
                endpoint: '/api/v1/dynamic',
                type: 'Dynamic API',
                duration: duration,
                cacheStatus: headers['x-cache'],
                edgeLocation: headers['x-amz-cf-pop']
            });

            resultDiv.innerHTML = this.formatAPIResponse(response, headers, duration);
            this.updateMetricsTable();

        } catch (error) {
            resultDiv.innerHTML = `<div style="color: #dc3545;">Error: ${error.message}</div>`;
        }
    }

    /**
     * Make API call (simulated for demo)
     */
    async makeAPICall(endpoint, cacheable) {
        // Simulate network delay
        const baseDelay = cacheable ? 50 : 200; // Cached requests are faster
        const randomDelay = Math.random() * 100;
        const totalDelay = baseDelay + randomDelay;

        await new Promise(resolve => setTimeout(resolve, totalDelay));

        // Return mock data
        const mockData = this.mockEndpoints[endpoint];
        if (!mockData) {
            throw new Error('Endpoint not found');
        }

        // For dynamic endpoints, update the data
        if (!cacheable) {
            mockData.data.timestamp = new Date().toISOString();
            mockData.data.user_id = Math.random().toString(36).substr(2, 9);
            mockData.data.session_id = Math.random().toString(36).substr(2, 16);
            mockData.data.random_value = Math.random();
        }

        return mockData.data;
    }

    /**
     * Format API response for display
     */
    formatAPIResponse(data, headers, duration) {
        const isHit = headers['x-cache'].toLowerCase().includes('hit');
        const statusColor = isHit ? '#28a745' : '#ffc107';

        return `
            <div style="margin-bottom: 15px;">
                <strong>Response Time:</strong> ${duration}ms
                <span style="color: ${statusColor}; margin-left: 10px;">
                    ● ${headers['x-cache']}
                </span>
            </div>
            <div style="margin-bottom: 15px;">
                <strong>Headers:</strong><br>
                <code style="font-size: 11px;">
                    Cache-Control: ${headers['cache-control']}<br>
                    X-Cache: ${headers['x-cache']}<br>
                    X-Amz-Cf-Pop: ${headers['x-amz-cf-pop']}<br>
                    Content-Encoding: ${headers['content-encoding']}
                </code>
            </div>
            <div style="margin-bottom: 10px;">
                <strong>Response Data:</strong>
            </div>
            <pre style="background: #f8f9fa; padding: 10px; border-radius: 4px; font-size: 12px; max-height: 200px; overflow-y: auto;">${JSON.stringify(data, null, 2)}</pre>
        `;
    }

    /**
     * Record API request for metrics
     */
    recordRequest(request) {
        this.requestHistory.push({
            ...request,
            timestamp: new Date().toISOString()
        });

        // Keep only last 20 requests
        if (this.requestHistory.length > 20) {
            this.requestHistory.shift();
        }
    }

    /**
     * Update metrics table
     */
    updateMetricsTable() {
        if (!this.metricsTable) return;

        // Clear existing rows
        this.metricsTable.innerHTML = '';

        // Add recent requests
        const recentRequests = this.requestHistory.slice(-10).reverse();
        
        recentRequests.forEach(request => {
            const row = document.createElement('tr');
            const isHit = request.cacheStatus.toLowerCase().includes('hit');
            
            row.innerHTML = `
                <td>${request.type}</td>
                <td>${request.duration}ms</td>
                <td>
                    <span style="color: ${isHit ? '#28a745' : '#ffc107'};">
                        ${request.cacheStatus}
                    </span>
                </td>
                <td>${request.edgeLocation}</td>
            `;
            
            this.metricsTable.appendChild(row);
        });

        // If no requests yet, show placeholder
        if (recentRequests.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td colspan="4" style="text-align: center; color: #6c757d; font-style: italic;">
                    No API requests made yet. Click the buttons above to test!
                </td>
            `;
            this.metricsTable.appendChild(row);
        }
    }

    /**
     * Get API performance summary
     */
    getAPIPerformanceSummary() {
        const totalRequests = this.requestHistory.length;
        if (totalRequests === 0) {
            return {
                totalRequests: 0,
                avgResponseTime: 0,
                cacheHitRatio: 0,
                cachedRequests: 0,
                dynamicRequests: 0
            };
        }

        const avgResponseTime = Math.round(
            this.requestHistory.reduce((sum, req) => sum + req.duration, 0) / totalRequests
        );

        const cacheHits = this.requestHistory.filter(req => 
            req.cacheStatus.toLowerCase().includes('hit')
        ).length;

        const cacheHitRatio = Math.round((cacheHits / totalRequests) * 100);

        const cachedRequests = this.requestHistory.filter(req => 
            req.type === 'Cached API'
        ).length;

        const dynamicRequests = this.requestHistory.filter(req => 
            req.type === 'Dynamic API'
        ).length;

        return {
            totalRequests,
            avgResponseTime,
            cacheHitRatio,
            cachedRequests,
            dynamicRequests
        };
    }

    /**
     * Simulate batch API requests for testing
     */
    async simulateBatchRequests() {
        const requests = [
            { endpoint: '/api/v1/static', cacheable: true },
            { endpoint: '/api/v1/dynamic', cacheable: false },
            { endpoint: '/api/v1/static', cacheable: true }, // Should hit cache
            { endpoint: '/api/v1/dynamic', cacheable: false },
            { endpoint: '/api/v1/static', cacheable: true }  // Should hit cache
        ];

        for (const req of requests) {
            const startTime = performance.now();
            await this.makeAPICall(req.endpoint, req.cacheable);
            const endTime = performance.now();
            const duration = Math.round(endTime - startTime);

            this.recordRequest({
                endpoint: req.endpoint,
                type: req.cacheable ? 'Cached API' : 'Dynamic API',
                duration: duration,
                cacheStatus: req.cacheable && Math.random() > 0.3 ? 'Hit from cloudfront' : 'Miss from cloudfront',
                edgeLocation: 'IAD89-C1'
            });

            // Small delay between requests
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        this.updateMetricsTable();
        
        const summary = this.getAPIPerformanceSummary();
        console.log('Batch request summary:', summary);

        return summary;
    }

    /**
     * Clear request history
     */
    clearHistory() {
        this.requestHistory = [];
        this.updateMetricsTable();
    }

    /**
     * Export request history as JSON
     */
    exportHistory() {
        const data = {
            summary: this.getAPIPerformanceSummary(),
            requests: this.requestHistory,
            exportedAt: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `cloudfront-api-metrics-${Date.now()}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
    }
}

// Initialize global API demo
window.apiDemo = new APIDemo();

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.apiDemo.init();
});

// Export functions for global access
window.testCachedAPI = () => window.apiDemo.testCachedAPI();
window.testDynamicAPI = () => window.apiDemo.testDynamicAPI();

// Export class for external access
window.APIDemo = APIDemo;
