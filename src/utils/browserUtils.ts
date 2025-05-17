export const isMobile: () => boolean = () =>
    /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent);

export const isSafari: () => boolean = () =>
    /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

export const isAndroid: () => boolean = () => /android/i.test(navigator.userAgent);

export const isFirefox: () => boolean = () =>
    navigator.userAgent.toLowerCase().indexOf('firefox') > 0;
