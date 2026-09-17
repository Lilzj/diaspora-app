/**
 * Who may do what with an alert, as the screens read it — 16 Sep 2026.
 *
 * Source-level guards on the two screens, because the rules are about what a
 * screen must never decide for itself: that Emergency is offered only when the
 * server says so, that a pin is sent only when the member asked for one and the
 * phone has a real fix, and that withdraw and cancel appear only where the post
 * itself allows them.
 */
const fs = require('fs') as { readFileSync(path: string, encoding: string): string };
const path = require('path') as { join(...segments: string[]): string };

function source(...segments: string[]): string {
  return fs.readFileSync(path.join(process.cwd(), 'src', ...segments), 'utf8');
}

describe('the alert composer', () => {
  const composer = source('app', 'update', 'create.tsx');

  it('offers Emergency only when the server reports the member may choose it', () => {
    expect(composer).toContain('useAlertCapabilities(');
    expect(composer).toMatch(/level\.value !== 'emergency' \|\| capabilities\?\.canPublishEmergency === true/);
    expect(composer).toContain('{urgencies.map(');
    expect(composer).not.toContain('{ALERT_URGENCIES.map(');
  });

  it('sends a pin only when the member asked for one and the phone has a device fix', () => {
    expect(composer).toMatch(/activeLocation\.precision === 'device'/);
    expect(composer).toMatch(/latitude: pin \? activeLocation\.latitude : null/);
    expect(composer).toMatch(/affectedRadiusMetres: pin \? affectedRadiusMetres : null/);
  });

  it('no longer shows a GPS badge over a form that sent no position', () => {
    expect(composer).not.toContain('📡 GPS ACTIVE');
  });
});

describe('the alert page', () => {
  const detail = source('app', 'update', '[id].tsx');

  it('offers withdraw and cancel only where the post allows them', () => {
    expect(detail).toContain('post.canWithdraw ?');
    expect(detail).toContain('post.canCancel ?');
    expect(detail).toContain('useClosePost(');
  });

  it('says a withdrawn or cancelled alert was taken back, rather than hiding it', () => {
    expect(detail).toContain("post?.status === 'withdrawn' || post?.status === 'cancelled'");
    expect(detail).toContain('post-closed-banner');
  });
});

describe('the alerts map', () => {
  const screen = source('app', 'map', 'alerts.tsx');

  it('draws only areas the alerts carry, never a default radius', () => {
    expect(screen).toContain('alert.area?.radiusMetres');
    expect(screen).not.toMatch(/radiusMetres \?\? 300/);
    expect(screen).not.toContain('useAlertArea(');
  });
});
