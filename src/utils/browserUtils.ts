export const isMobile: () => boolean = () =>
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

export const isSafari: () => boolean = () =>
    /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

export const isAndroid: () => boolean = () => /android/i.test(navigator.userAgent);
