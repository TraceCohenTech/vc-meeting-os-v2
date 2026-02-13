# Vercel Deployment Optimization Guide

## Overview

This document captures the deployment optimizations applied to VC Meeting OS V2 and best practices for future Next.js projects on Vercel.

## Current Configuration

### Build Metrics (Baseline → Optimized)

| Metric | Before | After | Notes |
|--------|--------|-------|-------|
| Build Time | ~72s | ~123s (first), then cached | First build longer due to standalone output |
| Upload Size | 109KB | 47.8KB | .vercelignore reduced upload significantly |
| Install Time | 10s | 9s | --prefer-offline flag |
| Node Version | 24.x | 24.x | Latest for best performance |

### Key Optimizations Applied

#### 1. next.config.mjs
```javascript
const nextConfig = {
  // Enable React strict mode for better development experience
  reactStrictMode: true,

  // Use SWC for faster builds
  swcMinify: true,

  // Optimize images with modern formats
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
    remotePatterns: [/* configured domains */],
  },

  // Standalone output for smaller deployments
  output: 'standalone',

  // Optimize package imports for faster builds
  experimental: {
    optimizePackageImports: ['lucide-react', '@supabase/supabase-js', 'googleapis'],
  },

  // Headers for caching static assets
  async headers() { /* Cache-Control headers */ },
}
```

#### 2. vercel.json
```json
{
  "framework": "nextjs",
  "regions": ["iad1"],
  "installCommand": "npm install --prefer-offline",
  "crons": [/* scheduled jobs */],
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [{ "key": "Cache-Control", "value": "no-store, must-revalidate" }]
    },
    {
      "source": "/(.*).ico",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=86400, stale-while-revalidate=604800" }]
    }
  ]
}
```

#### 3. .vercelignore
Excludes unnecessary files from uploads:
- Test files (`**/*.test.ts`, `**/*.spec.ts`)
- Documentation (`*.md`, `docs/`)
- Development configs (`.vscode/`, `.idea/`)
- Migrations (already applied to database)
- Build artifacts (`.turbo/`, `.cache/`)

## Best Practices for New Projects

### Day 1 Setup Checklist

1. **Create .vercelignore immediately**
   - Exclude test files, docs, and dev configs
   - Significantly reduces upload time

2. **Configure next.config.mjs with optimizations**
   - Enable `reactStrictMode: true`
   - Set `swcMinify: true`
   - Configure image optimization
   - Add `optimizePackageImports` for large packages

3. **Set up vercel.json**
   - Specify region (e.g., `"regions": ["iad1"]`)
   - Add `installCommand` with `--prefer-offline`
   - Configure caching headers

4. **Use Latest Node.js**
   - Vercel defaults to latest stable
   - Don't pin to older versions unless necessary

### TypeScript Tips

When using Supabase without generated types:
```typescript
// Use 'as never' for insert/update operations
.insert({ field: value } as never)
.update(updateData as never)
```

### Monorepo Considerations

If setting up a monorepo with multiple apps:
1. Add root `package.json` with workspaces
2. Install Turborepo: `npm install turbo --save-dev`
3. Create `turbo.json` for build caching
4. Use `pnpm` or `npm` workspaces

## Cron Jobs

Currently configured crons in vercel.json:
- `/api/cron/process-jobs` - Daily at 6 AM UTC
- `/api/cron/reminders-digest` - Daily at 1 PM UTC (8 AM EST)

## Performance Tips

1. **Image Optimization**: Use AVIF/WebP formats, configure proper cache TTL
2. **Static Assets**: Apply aggressive caching (1 year for immutable assets)
3. **API Routes**: Use `no-store` for dynamic data
4. **Build Cache**: Vercel automatically caches dependencies and build artifacts

## Troubleshooting

### Common Build Errors

1. **TypeScript "never" type errors with Supabase**
   - Use `as never` pattern for insert/update operations
   - Or generate proper database types

2. **Iterator downlevelIteration errors**
   - Convert Map.entries() to Array.from() first
   - Or update tsconfig to target ES2015+

3. **Dynamic server usage warnings**
   - Normal for API routes using cookies/auth
   - These routes are server-rendered, not static

## Resources

- [Vercel Build Optimization](https://vercel.com/docs/builds/managing-builds)
- [Next.js Production Checklist](https://nextjs.org/docs/pages/building-your-application/deploying/production-checklist)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)
