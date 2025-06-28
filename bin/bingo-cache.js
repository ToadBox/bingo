#!/usr/bin/env node

const { program } = require('commander');
const { CacheManager } = require('../src/private/utils/memoryCache');
const globalCache = require('../src/private/utils/globalCache');
const configLoader = require('../src/private/utils/configLoader');

program
  .name('bingo-cache')
  .description('Bingo cache management utility')
  .version('1.0.0');

program
  .command('stats')
  .description('Show cache statistics')
  .action(async () => {
    try {
      const cacheConfig = configLoader.get('cache', {
        enabled: false,
        maxSizeMB: 400,
        defaultTTL: 3600,
        cleanupInterval: 300,
        strategies: {
          database: { enabled: true, ttl: 1800 },
          sessions: { enabled: true, ttl: 7200 },
          boards: { enabled: true, ttl: 900 },
          static: { enabled: true, ttl: 3600 }
        }
      });

      if (!cacheConfig.enabled) {
        console.log('❌ Cache is disabled in configuration');
        return;
      }

      console.log('📊 Cache Configuration:');
      console.log(`   Max Size: ${cacheConfig.maxSizeMB}MB`);
      console.log(`   Default TTL: ${cacheConfig.defaultTTL}s (${(cacheConfig.defaultTTL/60).toFixed(1)} minutes)`);
      console.log(`   Cleanup Interval: ${cacheConfig.cleanupInterval}s (${(cacheConfig.cleanupInterval/60).toFixed(1)} minutes)`);
      console.log('');

      console.log('🔧 Cache Strategies:');
      Object.entries(cacheConfig.strategies).forEach(([name, config]) => {
        const status = config.enabled ? '✅' : '❌';
        console.log(`   ${status} ${name}: TTL ${config.ttl}s (${(config.ttl/60).toFixed(1)} minutes)`);
      });

      console.log('');
      console.log('💡 To view runtime statistics, use the admin panel or API endpoint:');
      console.log('   GET /api/admin/error-reports/cache/stats');
      console.log('');
      console.log('🔧 To test cache performance, run:');
      console.log('   npm run cache:test');
    } catch (error) {
      console.error('❌ Error reading cache configuration:', error.message);
      process.exit(1);
    }
  });

program
  .command('test')
  .description('Test cache performance')
  .option('-s, --size <size>', 'Cache size in MB', '100')
  .option('-i, --items <items>', 'Number of items to test', '10000')
  .action(async (options) => {
    const sizeMB = parseInt(options.size);
    const itemCount = parseInt(options.items);

    console.log(`🧪 Testing cache performance:`);
    console.log(`   Cache Size: ${sizeMB}MB`);
    console.log(`   Test Items: ${itemCount}`);
    console.log('');

    const cache = new CacheManager({
      enabled: true,
      maxSizeMB: sizeMB,
      defaultTTL: 3600,
      cleanupInterval: 300,
      strategies: {
        test: { enabled: true, ttl: 3600 }
      }
    });

    const testCache = cache.getCache('test');
    
    // Test write performance
    console.log('📝 Testing write performance...');
    const writeStart = Date.now();
    
    for (let i = 0; i < itemCount; i++) {
      const key = `test:item:${i}`;
      const value = {
        id: i,
        data: `This is test data for item ${i}`,
        timestamp: Date.now(),
        array: new Array(10).fill(i)
      };
      testCache.set(key, value);
    }
    
    const writeTime = Date.now() - writeStart;
    console.log(`   ✅ Wrote ${itemCount} items in ${writeTime}ms (${(itemCount / writeTime * 1000).toFixed(0)} items/sec)`);

    // Test read performance
    console.log('📖 Testing read performance...');
    const readStart = Date.now();
    let hits = 0;
    
    for (let i = 0; i < itemCount; i++) {
      const key = `test:item:${i}`;
      const value = testCache.get(key);
      if (value) hits++;
    }
    
    const readTime = Date.now() - readStart;
    console.log(`   ✅ Read ${itemCount} items in ${readTime}ms (${(itemCount / readTime * 1000).toFixed(0)} items/sec)`);
    console.log(`   📊 Hit rate: ${hits}/${itemCount} (${(hits / itemCount * 100).toFixed(1)}%)`);

    // Show final statistics
    console.log('');
    console.log('📈 Final Statistics:');
    const stats = testCache.getStats();
    console.log(`   Items: ${stats.itemCount}`);
    console.log(`   Memory: ${stats.currentSizeMB}MB / ${stats.maxSizeMB}MB`);
    console.log(`   Hit Rate: ${stats.hitRate}`);
    console.log(`   Operations: ${stats.sets} sets, ${stats.hits} hits, ${stats.misses} misses`);
    console.log(`   Evictions: ${stats.evictions}`);

    // Cleanup
    cache.destroy();
  });

program
  .command('benchmark')
  .description('Run comprehensive cache benchmarks')
  .action(async () => {
    console.log('🏁 Running comprehensive cache benchmarks...');
    console.log('');

    const sizes = [50, 100, 200, 400];
    const itemCounts = [1000, 5000, 10000];

    for (const sizeMB of sizes) {
      for (const itemCount of itemCounts) {
        console.log(`📊 Testing ${sizeMB}MB cache with ${itemCount} items:`);
        
        const cache = new CacheManager({
          enabled: true,
          maxSizeMB: sizeMB,
          defaultTTL: 3600,
          cleanupInterval: 300,
          strategies: {
            benchmark: { enabled: true, ttl: 3600 }
          }
        });

        const testCache = cache.getCache('benchmark');
        
        // Write test
        const writeStart = Date.now();
        for (let i = 0; i < itemCount; i++) {
          testCache.set(`bench:${i}`, { id: i, data: `data-${i}` });
        }
        const writeTime = Date.now() - writeStart;
        
        // Read test  
        const readStart = Date.now();
        for (let i = 0; i < itemCount; i++) {
          testCache.get(`bench:${i}`);
        }
        const readTime = Date.now() - readStart;
        
        const stats = testCache.getStats();
        console.log(`   Write: ${writeTime}ms | Read: ${readTime}ms | Memory: ${stats.currentSizeMB}MB | Hit Rate: ${stats.hitRate}`);
        
        cache.destroy();
      }
      console.log('');
    }
    
    console.log('✅ Benchmark complete!');
  });

program.parse(); 