# ============================================
# Stage de Desenvolvimento
# ============================================
FROM node:20-alpine AS development
WORKDIR /app

# Instalar dependências do sistema para Prisma
RUN apk add --no-cache openssl libc6-compat

# Copiar arquivos de dependências
COPY package*.json ./
COPY prisma ./prisma/

# Instalar TODAS as dependências com --legacy-peer-deps
RUN npm install --legacy-peer-deps

# Gerar Prisma Client
RUN npx prisma generate

# Copiar o resto do código
COPY . .

# Expor porta
EXPOSE 3000

# Comando padrão para desenvolvimento
CMD ["npm", "run", "start:dev"]

# ============================================
# Stage de Build (para produção)
# ============================================
FROM node:20-alpine AS builder
WORKDIR /app

# Instalar dependências do sistema
RUN apk add --no-cache openssl libc6-compat

# Copiar arquivos de dependências
COPY package*.json ./
COPY prisma ./prisma/

# Instalar dependências com --legacy-peer-deps
RUN npm ci --legacy-peer-deps

# Gerar Prisma Client
RUN npx prisma generate

# Copiar código fonte
COPY . .

# Build da aplicação
RUN npm run build

# ============================================
# Stage de Produção
# ============================================
FROM node:20-alpine AS production
WORKDIR /app

# Instalar dependências do sistema
RUN apk add --no-cache openssl libc6-compat

# Criar usuário não-root
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

# Copiar apenas o necessário
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nestjs:nodejs /app/package*.json ./

# Mudar para usuário não-root
USER nestjs

# Expor porta
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Comando para produção
CMD ["node", "dist/main"]