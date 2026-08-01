export function isNavItemActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  const depth = href.split('/').filter(Boolean).length;
  return depth > 1 && pathname.startsWith(`${href}/`);
}
