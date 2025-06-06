#!/bin/bash

# Bingo deployment script
# Usage: ./deploy.sh [production|staging]

# Set environment
ENV=${1:-production}
echo "Deploying to $ENV environment..."

# Configuration
APP_DIR="/path/to/bingo"  # Replace with your app directory
NGINX_CONFIG="/etc/nginx/sites-available/bingo"  # Replace with your Nginx config path
SERVICE_NAME="toadbox-bingo"

# Check if running as root
if [ "$(id -u)" != "0" ]; then
   echo "This script must be run as root" 1>&2
   exit 1
fi

# Pull latest changes
echo "Pulling latest changes..."
cd $APP_DIR
git pull

# Install dependencies
echo "Installing dependencies..."
npm ci --production

# Build assets if needed
# echo "Building assets..."
# npm run build

# Copy configuration files
echo "Copying configuration files..."
cp $APP_DIR/nginx.conf $NGINX_CONFIG
ln -sf $NGINX_CONFIG /etc/nginx/sites-enabled/

# Set up systemd service
echo "Setting up systemd service..."
cp $APP_DIR/bingo.service /etc/systemd/system/$SERVICE_NAME.service
systemctl daemon-reload

# Test nginx configuration
echo "Testing Nginx configuration..."
nginx -t
if [ $? -ne 0 ]; then
    echo "Nginx configuration test failed. Aborting." 1>&2
    exit 1
fi

# Restart services
echo "Restarting services..."
systemctl restart $SERVICE_NAME
systemctl restart nginx

# Check service status
echo "Checking service status..."
systemctl status $SERVICE_NAME --no-pager
systemctl status nginx --no-pager

echo "Deployment completed successfully!"
echo "If this is your first deployment, please make sure to:"
echo "1. Configure SSL with Let's Encrypt using certbot"
echo "2. Enable the service with: systemctl enable $SERVICE_NAME"
echo "3. Check logs with: journalctl -u $SERVICE_NAME -f" 