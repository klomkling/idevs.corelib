const SMALL_DEVICE_QUERY = 'only screen and (max-width: 768px)'

export function isSmallDevice(): boolean {
  return window.matchMedia(SMALL_DEVICE_QUERY).matches
}
