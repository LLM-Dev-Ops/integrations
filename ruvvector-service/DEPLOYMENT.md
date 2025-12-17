# RuvVector Service - Deployment Guide

## Quick Start (Local Development)

### Prerequisites
- Node.js 20+
- PostgreSQL 12+

### Steps

1. **Install dependencies:**
```bash
npm install
```

2. **Build the service:**
```bash
npm run build
```

3. **Set up environment variables:**
```bash
export DATABASE_URL="postgresql://user:password@localhost:5432/ruvector"
export RUVVECTOR_SERVICE_PORT=3100
```

4. **Initialize the database:**
```bash
npm run init-db
```

5. **Start the service:**
```bash
npm start
# or
./start.sh
```

## Docker Deployment

### Using Docker Compose (Recommended)

This will start both the service and PostgreSQL:

```bash
docker-compose up -d
```

The service will be available at `http://localhost:3100`

To view logs:
```bash
docker-compose logs -f ruvvector-service
```

To stop:
```bash
docker-compose down
```

### Using Docker Only

1. **Build the image:**
```bash
docker build -t ruvvector-service .
```

2. **Run with existing PostgreSQL:**
```bash
docker run -d \
  -p 3100:3100 \
  -e DATABASE_URL="postgresql://user:password@postgres-host:5432/ruvector" \
  --name ruvvector-service \
  ruvvector-service
```

## Production Deployment

### Environment Variables

Required:
- `DATABASE_URL` - PostgreSQL connection string

Optional:
- `RUVVECTOR_SERVICE_PORT` - HTTP port (default: 3100)
- `POSTGRES_HOST` - Database host (if not using DATABASE_URL)
- `POSTGRES_PORT` - Database port (default: 5432)
- `POSTGRES_USER` - Database user
- `POSTGRES_PASSWORD` - Database password
- `POSTGRES_DB` - Database name

### Database Setup

1. **Create the database:**
```sql
CREATE DATABASE ruvector;
CREATE USER ruvector WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE ruvector TO ruvector;
```

2. **Initialize schema:**
```bash
DATABASE_URL="postgresql://ruvector:secure_password@host:5432/ruvector" \
npm run init-db
```

### System Service (systemd)

Create `/etc/systemd/system/ruvvector-service.service`:

```ini
[Unit]
Description=RuvVector Telemetry Service
After=network.target postgresql.service

[Service]
Type=simple
User=ruvvector
WorkingDirectory=/opt/ruvvector-service
Environment="DATABASE_URL=postgresql://user:password@localhost:5432/ruvector"
Environment="RUVVECTOR_SERVICE_PORT=3100"
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable ruvvector-service
sudo systemctl start ruvvector-service
sudo systemctl status ruvvector-service
```

### Kubernetes Deployment

Create `k8s-deployment.yaml`:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: ruvvector-config
data:
  RUVVECTOR_SERVICE_PORT: "3100"
---
apiVersion: v1
kind: Secret
metadata:
  name: ruvvector-secrets
type: Opaque
stringData:
  DATABASE_URL: postgresql://user:password@postgres-service:5432/ruvector
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ruvvector-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ruvvector-service
  template:
    metadata:
      labels:
        app: ruvvector-service
    spec:
      containers:
      - name: ruvvector-service
        image: ruvvector-service:latest
        ports:
        - containerPort: 3100
        envFrom:
        - configMapRef:
            name: ruvvector-config
        - secretRef:
            name: ruvvector-secrets
        livenessProbe:
          httpGet:
            path: /health
            port: 3100
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3100
          initialDelaySeconds: 5
          periodSeconds: 5
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: ruvvector-service
spec:
  selector:
    app: ruvvector-service
  ports:
  - protocol: TCP
    port: 3100
    targetPort: 3100
  type: LoadBalancer
```

Deploy:
```bash
kubectl apply -f k8s-deployment.yaml
```

### Nginx Reverse Proxy

```nginx
upstream ruvvector {
    server localhost:3100;
}

server {
    listen 80;
    server_name telemetry.example.com;

    location / {
        proxy_pass http://ruvvector;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Monitoring

### Health Checks

The `/health` endpoint provides service health status:

```bash
curl http://localhost:3100/health
```

Use this for:
- Load balancer health checks
- Kubernetes liveness/readiness probes
- Monitoring systems (Datadog, New Relic, etc.)

### Metrics to Monitor

1. **Service Availability**
   - Health check success rate
   - Response time

2. **Database Performance**
   - Connection pool stats (available via /health)
   - Query performance
   - Connection errors

3. **API Performance**
   - Request rate
   - Response times
   - Error rates

4. **Resource Usage**
   - CPU usage
   - Memory usage
   - Disk I/O (for database)

### Log Aggregation

The service logs to stdout/stderr. Collect logs using:

- Docker: `docker logs`
- Kubernetes: `kubectl logs`
- systemd: `journalctl -u ruvvector-service`
- PM2: `pm2 logs ruvvector-service`

## Scaling Considerations

### Horizontal Scaling

The service is stateless and can be scaled horizontally:

```bash
# Docker Compose
docker-compose up -d --scale ruvvector-service=3

# Kubernetes
kubectl scale deployment ruvvector-service --replicas=5
```

### Database Scaling

1. **Connection Pooling**: Already configured in shared/database module
2. **Read Replicas**: Point queries to read replicas
3. **Partitioning**: Partition telemetry_events by timestamp
4. **Archival**: Move old events to archive tables

### Performance Tuning

1. **Batch Inserts**: Use batch endpoint for multiple events
2. **Database Indexes**: Already created for common queries
3. **Connection Pool**: Adjust `max` parameter in database config
4. **Query Limits**: Set reasonable default limits

## Security

### Best Practices

1. **Use HTTPS**: Deploy behind HTTPS reverse proxy
2. **Database Security**: Use strong passwords, SSL connections
3. **Network Security**: Use firewalls, VPCs, security groups
4. **Secrets Management**: Use environment variables or secrets management (Vault, AWS Secrets Manager)
5. **Rate Limiting**: Add rate limiting (nginx, API gateway)
6. **Authentication**: Add authentication layer if needed (not included in minimal version)

### SSL/TLS for Database

Set in DATABASE_URL:
```
postgresql://user:password@host:5432/ruvector?ssl=true
```

## Backup and Recovery

### Database Backups

```bash
# Backup
pg_dump -h localhost -U ruvector ruvector > backup.sql

# Restore
psql -h localhost -U ruvector ruvector < backup.sql
```

### Automated Backups

Use pg_basebackup, WAL archiving, or cloud provider backup solutions:
- AWS RDS: Automated snapshots
- Google Cloud SQL: Automated backups
- Azure Database: Automated backups

## Troubleshooting

### Service won't start

1. Check database connectivity:
```bash
psql $DATABASE_URL -c "SELECT 1"
```

2. Check logs:
```bash
npm start
# or
docker logs ruvvector-service
```

3. Verify build:
```bash
npm run build
```

### Database connection issues

1. Check environment variables
2. Verify database is running
3. Check network connectivity
4. Review database logs

### High memory usage

1. Check connection pool size
2. Review query performance
3. Monitor for connection leaks
4. Consider limiting batch sizes

## Maintenance

### Updating the Service

1. **Pull latest code**
2. **Install dependencies**: `npm install`
3. **Build**: `npm run build`
4. **Restart service**

### Database Maintenance

1. **Vacuum**: `VACUUM ANALYZE telemetry_events;`
2. **Reindex**: `REINDEX TABLE telemetry_events;`
3. **Archive old data**: Move events older than X days to archive table
4. **Monitor size**: `SELECT pg_size_pretty(pg_total_relation_size('telemetry_events'));`

### Archival Strategy

Archive old events to reduce table size:

```sql
-- Create archive table
CREATE TABLE telemetry_events_archive (LIKE telemetry_events INCLUDING ALL);

-- Move old events (older than 90 days)
INSERT INTO telemetry_events_archive
SELECT * FROM telemetry_events
WHERE created_at < NOW() - INTERVAL '90 days';

-- Delete from main table
DELETE FROM telemetry_events
WHERE created_at < NOW() - INTERVAL '90 days';

-- Vacuum
VACUUM ANALYZE telemetry_events;
```
