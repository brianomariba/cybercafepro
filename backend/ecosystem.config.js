/**
 * PM2 Ecosystem Configuration for HawkNine Backend
 * Use: pm2 start ecosystem.config.js --env production
 */

module.exports = {
    apps: [{
        name: 'hawknine-api',
        script: 'server.js',
        instances: 'max',           // Use all available CPU cores
        exec_mode: 'cluster',       // Enable clustering
        env_production: {
            NODE_ENV: 'production',
            PORT: 5000
        },
        env_development: {
            NODE_ENV: 'development',
            PORT: 5000
        },

        // Process management
        watch: false,               // Don't watch for file changes in production
        max_memory_restart: '500M', // Restart if memory exceeds 500MB
        min_uptime: '10s',          // Minimum uptime before considering app started
        max_restarts: 10,           // Maximum restarts before stopping
        restart_delay: 4000,        // Delay between restarts

        // Logging
        error_file: '/var/log/pm2/hawknine-error.log',
        out_file: '/var/log/pm2/hawknine-out.log',
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        merge_logs: true,

        // Advanced options
        kill_timeout: 5000,         // Time to wait before SIGKILL
        listen_timeout: 10000,      // Time to wait for workers to listen

        // Environment variables (loaded from .env in production)
        // These are fallbacks only
        env: {
            PORT: 5000
        }
    }]
};
