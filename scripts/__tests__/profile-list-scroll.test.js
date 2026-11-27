/**
 * @jest-environment node
 *
 * The scroll profiler's reading of what Android prints (FARCH-004).
 *
 * The profiler turns `dumpsys gfxinfo` and `dumpsys meminfo` into the numbers a
 * before-and-after comparison rests on. A parser that read the legacy janky
 * count, or a GPU percentile, would compare the wrong thing on both builds and
 * agree with itself. The samples below are laid out as those commands print
 * them; the numbers are made up for the parser and measure nothing.
 */

const {
  parseGfxinfo,
  parseMeminfo,
  parseScreenSize,
  isFocused,
  incomparable,
  comparison,
} = require('../profile-list-scroll');

const GFXINFO = `
Applications Graphics Acceleration Info:
Uptime: 912345 Realtime: 912345

** Graphics info for pid 4242 [com.diaspora.app] **

Stats since: 812345678901ns
Total frames rendered: 1180
Janky frames: 59 (5.00%)
Janky frames (legacy): 140 (11.86%)
50th percentile: 9ms
90th percentile: 17ms
95th percentile: 23ms
99th percentile: 41ms
Number Missed Vsync: 4
Number High input latency: 310
Number Slow UI thread: 28
Number Slow bitmap uploads: 3
Number Slow issue draw commands: 19
Number Frame deadline missed: 52
Number Frame deadline missed (legacy): 61
HISTOGRAM: 5ms=200 6ms=150 7ms=120
50th gpu percentile: 4ms
90th gpu percentile: 8ms
95th gpu percentile: 11ms
99th gpu percentile: 19ms
`;

const MEMINFO = `
Applications Memory Usage (in Kilobytes):
Uptime: 912345 Realtime: 912345

** MEMINFO in pid 4242 [com.diaspora.app] **
                   Pss  Private  Private  SwapPss      Rss     Heap     Heap     Heap
                 Total    Dirty    Clean    Dirty    Total     Size    Alloc     Free
                ------   ------   ------   ------   ------   ------   ------   ------
  Native Heap    61234    61100        0        0    63000    90000    70000    20000
        TOTAL   251234   200000    30000        0   330000   130000   100000    30000

 App Summary
                       Pss(KB)                        Rss(KB)
                        ------                         ------
           Java Heap:    21000                          40000
         Native Heap:    61100                          63000
                Code:    41000                          90000
               Stack:     1500                           1600
            Graphics:    52000                          52000
       Private Other:    14000
              System:    61634
             Unknown:                                    3000

           TOTAL PSS:   251234            TOTAL RSS:   330000       TOTAL SWAP PSS:        0
`;

describe('frame statistics', () => {
  it('reads the janky frames and percentiles a comparison rests on', () => {
    expect(parseGfxinfo(GFXINFO)).toEqual({
      totalFrames: 1180,
      jankyFrames: 59,
      jankyPercent: 5,
      p50Ms: 9,
      p90Ms: 17,
      p95Ms: 23,
      p99Ms: 41,
      missedVsync: 4,
      slowUiThread: 28,
      slowBitmapUploads: 3,
      slowDrawCommands: 19,
      frameDeadlineMissed: 52,
    });
  });

  it('reads nothing as nothing, never as zero', () => {
    // A zero would read as a perfectly smooth list.
    const read = parseGfxinfo('no statistics here');
    expect(Object.values(read).every((value) => value === null)).toBe(true);
  });
});

describe('memory', () => {
  it('reads the App Summary', () => {
    expect(parseMeminfo(MEMINFO)).toEqual({
      totalPssKb: 251234,
      javaHeapKb: 21000,
      nativeHeapKb: 61100,
      graphicsKb: 52000,
    });
  });

  it('falls back to the table total where there is no App Summary', () => {
    expect(parseMeminfo('        TOTAL   99999   80000').totalPssKb).toBe(99999);
  });
});

describe('the device', () => {
  it('swipes at the size the app draws at', () => {
    expect(parseScreenSize('Physical size: 1080x2400')).toEqual({ width: 1080, height: 2400 });
    expect(parseScreenSize('Physical size: 1080x2400\nOverride size: 720x1600')).toEqual({ width: 720, height: 1600 });
    expect(parseScreenSize('nothing')).toBeNull();
  });

  it('knows whether the app is the window in front', () => {
    expect(isFocused('  mCurrentFocus=Window{1a2b u0 com.diaspora.app/com.diaspora.app.MainActivity}')).toBe(true);
    expect(isFocused('  mCurrentFocus=Window{1a2b u0 com.android.launcher3/.Launcher}')).toBe(false);
  });
});

describe('a comparison', () => {
  const profile = (label, overrides = {}) => ({
    label,
    device: { model: 'Galaxy A35', android: '15', size: '1080x2340' },
    swipes: 20,
    gfx: parseGfxinfo(GFXINFO),
    memory: parseMeminfo(MEMINFO),
    ...overrides,
  });

  it('refuses two profiles that did not measure the same thing', () => {
    expect(incomparable(profile('a'), profile('b'))).toEqual([]);
    expect(incomparable(profile('a'), profile('b', { swipes: 10 }))).toEqual(['different swipe counts: 20 and 10']);
    expect(
      incomparable(profile('a'), profile('b', { device: { model: 'Pixel 8', android: '15', size: '1080x2400' } }))
    ).toEqual(['different devices: Galaxy A35 and Pixel 8']);
  });

  it('states each change with its sign', () => {
    const after = profile('after', { gfx: { ...parseGfxinfo(GFXINFO), jankyPercent: 2.5 } });
    const janky = comparison(profile('before'), after).find((row) => row.name === 'janky frames');
    expect(janky).toEqual({ name: 'janky frames', before: '5%', after: '2.5%', change: '-2.5%' });
  });
});
