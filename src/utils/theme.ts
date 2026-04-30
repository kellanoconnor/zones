export const T = {
  bg: {
    page: '#0A0D12',
    card: '#11151C',
    cardHi: '#161B24',
    track: '#1C222C',
    line: 'rgba(255,255,255,0.06)',
    lineStrong: 'rgba(255,255,255,0.10)',
  },
  text: {
    primary: '#F2F3F5',
    secondary: 'rgba(242,243,245,0.62)',
    tertiary: 'rgba(242,243,245,0.38)',
    quat: 'rgba(242,243,245,0.20)',
  },
  zones: ['#6B9DD9', '#6BC28E', '#D9B45E', '#D98B5E', '#D96E7A'],
  accent: '#7AA9E0',
  accentDim: 'rgba(122,169,224,0.16)',
};

// zones[0] = Zone 1, zones[4] = Zone 5
export function zoneColor(zoneId: number): string {
  return T.zones[zoneId - 1] ?? T.text.tertiary;
}
