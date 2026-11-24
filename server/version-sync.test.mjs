// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

/**
 * The app closes itself to reload when the installed APK reports a newer
 * version than the web bundle, so these three must always agree.
 */
it('version matches in package.json, src/app/version.ts and android/app/build.gradle', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')).version;
  const bundle = /APP_VERSION = '([^']+)'/.exec(readFileSync('src/app/version.ts', 'utf8'))?.[1];
  const android = /versionName\s+"([^"]+)"/.exec(readFileSync('android/app/build.gradle', 'utf8'))?.[1];
  expect(bundle).toBe(pkg);
  expect(android).toBe(pkg);
});
