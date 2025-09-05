/**
 * CloudFront Demo - Main JavaScript Module
 * Demonstrates CloudFront features and performance
 */

// Global app state
window.CloudFrontDemo = {
    metrics: {
        loadTime: 0,
        cacheHitRatio: 0,
        bandwidthSaved: 0,
        edgeLocation: 'Unknown'
    },
    requests: [],
    startTime: performance.now()
};

/**
 * Initialize demo features when DOM is loaded
 */
function initializeDemoFeatures() {
    // Mobile navigation toggle
    initMobileNavigation();
    
    // Smooth scrolling for navigation links
    initSmoothScrolling();
    
    // Initialize CloudFront headers detection
    detectCloudFrontHeaders();
    
    // Start performance monitoring
    startPerformanceMonitoring();
    
    console.log('CloudFront Demo initialized');
}

/**
 * Mobile navigation functionality
 */
function initMobileNavigation() {
    const navToggle = document.querySelector('.nav-toggle');
    const navMenu = document.querySelector('.nav-menu');
    
    if (navToggle && navMenu) {
        navToggle.addEventListener('click', function() {
            navMenu.classList.toggle('active');
            navToggle.classList.toggle('active');
        });
        
        // Close menu when clicking on links
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                navMenu.classList.remove('active');
                navToggle.classList.remove('active');
            });
        });
    }
}

/**
 * Smooth scrolling for anchor links
 */
function initSmoothScrolling() {
    const links = document.querySelectorAll('a[href^="#"]');
    
    links.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href').substring(1);
            const targetElement = document.getElementById(targetId);
            
            if (targetElement) {
                const headerHeight = document.querySelector('.header').offsetHeight;
                const targetPosition = targetElement.offsetTop - headerHeight - 20;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
}

/**
 * Detect CloudFront headers and edge location
 */
function detectCloudFrontHeaders() {
    // Try to detect CloudFront headers from various sources
    const headers = {
        'cloudfront-viewer-country': getHeaderValue('CloudFront-Viewer-Country'),
        'cloudfront-pop': getHeaderValue('CloudFront-Pop'),
        'cloudfront-request-id': getHeaderValue('X-Amz-Cf-Id'),
        'cache-control': getHeaderValue('Cache-Control'),
        'x-cache': getHeaderValue('X-Cache')
    };
    
    // Update edge location if detected
    if (headers['cloudfront-pop']) {
        updateMetric('edge-location', headers['cloudfront-pop']);
        window.CloudFrontDemo.metrics.edgeLocation = headers['cloudfront-pop'];
    }
    
    // Estimate cache hit ratio based on X-Cache header
    if (headers['x-cache']) {
        const isHit = headers['x-cache'].toLowerCase().includes('hit');
        updateCacheHitRatio(isHit);
    }
    
    console.log('CloudFront headers detected:', headers);
}

/**
 * Get header value (simulation for demo purposes)
 */
function getHeaderValue(headerName) {
    // In a real scenario, these would come from actual HTTP headers
    // For demo purposes, we'll simulate some values
    const simulatedHeaders = {
        'CloudFront-Viewer-Country': 'US',
        'CloudFront-Pop': 'IAD89-C1',
        'X-Amz-Cf-Id': 'K0jZTNXjDEUVW-9QwKzqG4UNF8bxQZklVF2fHrxZbxd9YgY3GhTw==',
        'Cache-Control': 'public, max-age=86400',
        'X-Cache': Math.random() > 0.2 ? 'Hit from cloudfront' : 'Miss from cloudfront'
    };
    
    return simulatedHeaders[headerName] || null;
}

/**
 * Start performance monitoring
 */
function startPerformanceMonitoring() {
    // Monitor page load performance
    window.addEventListener('load', measurePagePerformance);
    
    // Monitor resource loading
    monitorResourceLoading();
    
    // Start periodic updates
    setInterval(updatePerformanceMetrics, 5000);
}

/**
 * Measure page performance
 */
function measurePagePerformance() {
    if ('performance' in window) {
        const navigation = performance.getEntriesByType('navigation')[0];
        const loadTime = Math.round(navigation.loadEventEnd - navigation.fetchStart);
        
        updateMetric('load-time', loadTime);
        window.CloudFrontDemo.metrics.loadTime = loadTime;
        
        // Calculate bandwidth saved (simulation)
        calculateBandwidthSaved();
        
        console.log('Page load time:', loadTime + 'ms');
    }
}

/**
 * Monitor resource loading for cache analysis
 */
function monitorResourceLoading() {
    const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
            if (entry.transferSize && entry.encodedBodySize) {
                const compressionRatio = 1 - (entry.transferSize / entry.encodedBodySize);
                if (compressionRatio > 0) {
                    const saved = entry.encodedBodySize - entry.transferSize;
                    window.CloudFrontDemo.metrics.bandwidthSaved += saved;
                }
            }
        });
    });
    
    observer.observe({ entryTypes: ['resource'] });
}

/**
 * Calculate bandwidth saved through compression
 */
function calculateBandwidthSaved() {
    const resources = performance.getEntriesByType('resource');
    let totalSaved = 0;
    
    resources.forEach(resource => {
        if (resource.transferSize && resource.encodedBodySize) {
            const saved = resource.encodedBodySize - resource.transferSize;
            if (saved > 0) {
                totalSaved += saved;
            }
        }
    });
    
    // Add some simulated savings for demo
    totalSaved += Math.random() * 50000; // Random 0-50KB saved
    
    const savedKB = Math.round(totalSaved / 1024);
    updateMetric('bandwidth-saved', savedKB);
    window.CloudFrontDemo.metrics.bandwidthSaved = savedKB;
}

/**
 * Update cache hit ratio
 */
function updateCacheHitRatio(isHit) {
    window.CloudFrontDemo.requests.push(isHit);
    
    // Keep only last 20 requests for rolling average
    if (window.CloudFrontDemo.requests.length > 20) {
        window.CloudFrontDemo.requests.shift();
    }
    
    const hits = window.CloudFrontDemo.requests.filter(hit => hit).length;
    const ratio = Math.round((hits / window.CloudFrontDemo.requests.length) * 100);
    
    updateMetric('cache-hit-ratio', ratio);
    window.CloudFrontDemo.metrics.cacheHitRatio = ratio;
}

/**
 * Update performance metrics display
 */
function updatePerformanceMetrics() {
    // Simulate some metric variations for demo
    const currentTime = Math.round(performance.now() - window.CloudFrontDemo.startTime);
    
    // Slightly vary the load time
    if (window.CloudFrontDemo.metrics.loadTime > 0) {
        const variation = Math.round((Math.random() - 0.5) * 20);
        updateMetric('load-time', Math.max(100, window.CloudFrontDemo.metrics.loadTime + variation));
    }
    
    // Update cache hit ratio occasionally
    if (Math.random() > 0.7) {
        const isHit = Math.random() > 0.15; // 85% hit rate
        updateCacheHitRatio(isHit);
    }
}

/**
 * Update a metric display
 */
function updateMetric(metricId, value) {
    const element = document.getElementById(metricId);
    if (element) {
        // Add some formatting
        let formattedValue = value;
        if (metricId === 'cache-hit-ratio') {
            formattedValue = value + '%';
        } else if (metricId === 'bandwidth-saved') {
            formattedValue = value + 'KB';
        } else if (metricId === 'load-time') {
            formattedValue = value + 'ms';
        }
        
        element.textContent = formattedValue;
        
        // Add animation
        element.classList.add('metric-updated');
        setTimeout(() => {
            element.classList.remove('metric-updated');
        }, 1000);
    }
}

/**
 * Feature demonstration functions
 */

// Test cache performance
function testCachePerformance() {
    const startTime = performance.now();
    
    // Make a request to a cacheable resource
    fetch('/assets/css/styles.css?' + Math.random())
        .then(response => {
            const endTime = performance.now();
            const loadTime = Math.round(endTime - startTime);
            
            // Check cache headers
            const cacheControl = response.headers.get('cache-control');
            const xCache = response.headers.get('x-cache') || 'Miss from cloudfront';
            
            alert(`Cache Performance Test Results:
Load Time: ${loadTime}ms
Cache Control: ${cacheControl || 'Not set'}
Cache Status: ${xCache}
Response Size: ${response.headers.get('content-length') || 'Unknown'} bytes`);
            
            updateCacheHitRatio(xCache.toLowerCase().includes('hit'));
        })
        .catch(error => {
            console.error('Cache test failed:', error);
            alert('Cache test failed. Check console for details.');
        });
}

// Load dynamic content
function loadDynamicContent() {
    const container = document.createElement('div');
    container.innerHTML = `
        <div style="background: #f8f9fa; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #007aff;">
            <h4>Dynamic Content Loaded</h4>
            <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
            <p><strong>Random ID:</strong> ${Math.random().toString(36).substr(2, 9)}</p>
            <p><strong>Cache Status:</strong> No Cache (Dynamic)</p>
            <p>This content bypasses CloudFront cache and is served directly from the origin.</p>
        </div>
    `;
    
    // Insert after hero section
    const hero = document.querySelector('.hero');
    if (hero && hero.nextSibling) {
        hero.parentNode.insertBefore(container, hero.nextSibling);
    }
    
    // Remove after 10 seconds
    setTimeout(() => {
        container.remove();
    }, 10000);
}

// Show edge location
function showEdgeLocation() {
    const resultDiv = document.getElementById('edge-location-info');
    if (resultDiv) {
        // Simulate edge location detection
        const edgeLocations = [
            'IAD89-C1 (Virginia)',
            'DFW55-C2 (Dallas)',
            'LAX3-C1 (Los Angeles)',
            'SEA19-C1 (Seattle)',
            'LHR5-C1 (London)',
            'FRA56-C1 (Frankfurt)',
            'NRT57-C1 (Tokyo)',
            'SYD4-C1 (Sydney)'
        ];
        
        const randomLocation = edgeLocations[Math.floor(Math.random() * edgeLocations.length)];
        
        resultDiv.innerHTML = `
            <strong>Your Edge Location:</strong><br>
            ${randomLocation}<br>
            <small>Estimated based on your geographic location</small>
        `;
        
        updateMetric('edge-location', randomLocation.split(' ')[0]);
    }
}

// Demonstrate caching
function demonstrateCaching() {
    const resultDiv = document.getElementById('cache-demo-result');
    if (resultDiv) {
        const cacheDemo = {
            'HTML files': 'max-age=300 (5 minutes)',
            'CSS files': 'max-age=86400 (1 day)',
            'JS files': 'max-age=86400 (1 day)',
            'Images': 'max-age=2592000 (30 days)',
            'API calls': 'no-cache (0 seconds)'
        };
        
        let output = '<strong>Cache Headers by File Type:</strong><br>';
        Object.entries(cacheDemo).forEach(([type, cache]) => {
            output += `${type}: ${cache}<br>`;
        });
        
        resultDiv.innerHTML = output;
    }
}

// Test compression
function testCompression() {
    const resultDiv = document.getElementById('compression-result');
    if (resultDiv) {
        // Simulate compression test
        const compressionData = {
            'HTML': '68% smaller',
            'CSS': '75% smaller',
            'JavaScript': '65% smaller',
            'JSON': '70% smaller'
        };
        
        let output = '<strong>Compression Results:</strong><br>';
        Object.entries(compressionData).forEach(([type, compression]) => {
            output += `${type}: ${compression}<br>`;
        });
        
        resultDiv.innerHTML = output;
    }
}

// Check SSL
function checkSSL() {
    const resultDiv = document.getElementById('ssl-result');
    if (resultDiv) {
        const isSecure = location.protocol === 'https:';
        const sslInfo = {
            'Protocol': location.protocol.toUpperCase(),
            'Certificate': isSecure ? 'Valid SSL Certificate' : 'No SSL',
            'Encryption': isSecure ? 'TLS 1.3' : 'None',
            'HSTS': isSecure ? 'Enabled' : 'Disabled'
        };
        
        let output = '<strong>SSL/TLS Status:</strong><br>';
        Object.entries(sslInfo).forEach(([key, value]) => {
            output += `${key}: ${value}<br>`;
        });
        
        resultDiv.innerHTML = output;
    }
}

// Update build information
function updateBuildInfo() {
    const buildVersion = document.getElementById('build-version');
    const deployTime = document.getElementById('deploy-time');
    
    if (buildVersion) {
        buildVersion.textContent = 'v1.0.0-demo';
    }
    
    if (deployTime) {
        deployTime.textContent = new Date().toISOString().split('T')[0];
    }
}

// Add CSS for metric updates
const style = document.createElement('style');
style.textContent = `
    .metric-updated {
        animation: metricPulse 1s ease-in-out;
    }
    
    @keyframes metricPulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.05); }
        100% { transform: scale(1); }
    }
    
    .nav-menu.active {
        display: flex !important;
        flex-direction: column;
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: white;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        padding: 1rem;
        z-index: 1000;
    }
    
    .nav-toggle.active span:nth-child(1) {
        transform: rotate(45deg) translate(5px, 5px);
    }
    
    .nav-toggle.active span:nth-child(2) {
        opacity: 0;
    }
    
    .nav-toggle.active span:nth-child(3) {
        transform: rotate(-45deg) translate(7px, -6px);
    }
`;
document.head.appendChild(style);

// Export functions for global access
window.testCachePerformance = testCachePerformance;
window.loadDynamicContent = loadDynamicContent;
window.showEdgeLocation = showEdgeLocation;
window.demonstrateCaching = demonstrateCaching;
window.testCompression = testCompression;
window.checkSSL = checkSSL;
window.initializeDemoFeatures = initializeDemoFeatures;
window.measurePagePerformance = measurePagePerformance;
window.updateBuildInfo = updateBuildInfo;
