import { call, save, verifiedUser } from './e2e-harness.mjs';
const RUN = process.env.RUNTIME_RUN;
const u = await verifiedUser({ name: 'Probe Reader', phone: `+23481000${RUN}009`, password: 'Pr9#zqWt3Nk8' });
const T = u.token;
const variants = [
  '/housing/search?limit=25',
  '/housing/search?countryCode=NG&limit=25',
  '/housing/search?query=Yaba&limit=25',
  '/housing/search?query=Yaba&countryCode=NG&limit=25',
  '/housing/search?AvailableOnly=false&limit=25',
  '/housing/search?query=e2e417&limit=25',
  '/housing/search?City=Lagos&limit=25',
];
for (const v of variants) {
  const r = await call('GET', v, { token: T, label: v });
  const d = r.body?.data ?? {};
  console.log(String(r.status).padEnd(4), String(d.totalCount).padEnd(5), 'items=' + (d.items?.length ?? '-'), ' loc=' + d.resolvedLocation, ' ', v);
}
