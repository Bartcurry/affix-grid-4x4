export const dailyPage = 'daily.html';
export const isDailyPage = (pathname: string) => pathname.endsWith(`/${dailyPage}`);

export function campaignUrl(address: string) {
  const url = new URL(address);
  if (isDailyPage(url.pathname)) url.pathname = url.pathname.slice(0, -dailyPage.length);
  return url;
}
