export interface ComposeTemplate {
  id: string;
  name: string;
  description: string;
  yaml: string;
}

export const COMPOSE_TEMPLATES: ComposeTemplate[] = [
  {
    id: "minimal",
    name: "Minimal",
    description: "Single service, port mapping, restart policy",
    yaml: `services:
  my-app:
    image: my-app:latest
    ports:
      - "8080:80"
    restart: unless-stopped
`,
  },
  {
    id: "small",
    name: "Small (app + db)",
    description: "Two services sharing a named network",
    yaml: `services:
  my-app:
    image: my-app:latest
    ports:
      - "8080:80"
    environment:
      - DB_HOST=my-db
      - DB_PORT=5432
    networks:
      - app-net
    restart: unless-stopped
    depends_on:
      - my-db

  my-db:
    image: my-db:latest
    environment:
      - POSTGRES_DB=appdb
      - POSTGRES_USER=appuser
      - POSTGRES_PASSWORD=changeme
    volumes:
      - db-data:/var/lib/data
    networks:
      - app-net
    restart: unless-stopped

volumes:
  db-data:

networks:
  app-net:
`,
  },
  {
    id: "volumes",
    name: "Volumes",
    description: "Named volume, bind mount, tmpfs examples",
    yaml: `services:
  my-app:
    image: my-app:latest
    ports:
      - "8080:80"
    volumes:
      # Named volume (managed by Docker)
      - app-data:/var/lib/app/data
      # Bind mount (host path → container path)
      - ./config:/etc/my-app/config:ro
      # Tmpfs (in-memory, cleared on restart)
      - type: tmpfs
        target: /tmp/cache
    restart: unless-stopped

volumes:
  app-data:
    driver: local
`,
  },
  {
    id: "network",
    name: "Networking",
    description: "Custom bridge network, aliases, internal network",
    yaml: `services:
  my-app:
    image: my-app:latest
    ports:
      - "8080:80"
    networks:
      frontend:
        aliases:
          - app
      backend:
    restart: unless-stopped

  my-db:
    image: my-db:latest
    networks:
      backend:
        aliases:
          - database
    restart: unless-stopped

  my-cache:
    image: my-cache:latest
    networks:
      backend:
    restart: unless-stopped

networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
    internal: true
`,
  },
  {
    id: "experimental",
    name: "Healthcheck & deps",
    description: "Healthcheck, depends_on with condition, restart on-failure",
    yaml: `services:
  my-app:
    image: my-app:latest
    ports:
      - "8080:80"
    depends_on:
      my-db:
        condition: service_healthy
    restart: on-failure:5

  my-db:
    image: my-db:latest
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "appuser"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    environment:
      - POSTGRES_DB=appdb
      - POSTGRES_USER=appuser
      - POSTGRES_PASSWORD=changeme
    volumes:
      - db-data:/var/lib/data
    restart: unless-stopped

volumes:
  db-data:
`,
  },
  {
    id: "full",
    name: "Full example",
    description: "Networks + volumes + healthcheck + env_file + multiple services",
    yaml: `services:
  my-app:
    image: my-app:latest
    ports:
      - "8080:80"
    env_file:
      - .env
    environment:
      - NODE_ENV=production
    volumes:
      - app-data:/var/lib/app/data
      - ./config:/etc/my-app/config:ro
    networks:
      - frontend
      - backend
    depends_on:
      my-db:
        condition: service_healthy
      my-cache:
        condition: service_started
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    restart: unless-stopped
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  my-db:
    image: my-db:latest
    env_file:
      - .env.db
    volumes:
      - db-data:/var/lib/data
    networks:
      - backend
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "appuser"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    restart: unless-stopped

  my-cache:
    image: my-cache:latest
    networks:
      - backend
    restart: unless-stopped

  my-proxy:
    image: my-proxy:latest
    ports:
      - "443:443"
    volumes:
      - ./proxy-config:/etc/proxy/conf.d:ro
      - certs:/etc/certs
    networks:
      - frontend
    depends_on:
      - my-app
    restart: unless-stopped

volumes:
  app-data:
  db-data:
  certs:

networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
    internal: true
`,
  },
];
