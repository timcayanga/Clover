export const approvedOrigins = ['https://clover.ph', 'https://staging.clover.ph'];
export function approvedOrigin(value) {
 const u=new URL(value);
 if(u.username||u.password||!approvedOrigins.includes(u.origin))throw new Error('Unapproved QA origin');
 return u.origin;
}
export const authenticatedRoutes=['/home','/transactions','/accounts','/reports','/adviser','/budgeting','/goals','/investments','/split-bill','/circles','/recurring','/settings'];
export const deviceMatrix=[
 {name:'desktop-chromium',engine:'chromium',width:1440,height:900},
 {name:'laptop-chromium',engine:'chromium',width:1280,height:800},
 {name:'wide-desktop-chromium',engine:'chromium',width:1920,height:1080},
 {name:'android-phone-chromium',engine:'chromium',preset:'Pixel 7',width:393,height:851,isMobile:true,hasTouch:true},
 {name:'foldable-closed-chromium',engine:'chromium',width:360,height:800,isMobile:true,hasTouch:true},
 {name:'foldable-open-chromium',engine:'chromium',width:884,height:1104,isMobile:true,hasTouch:true},
 {name:'duo-spanned-width-chromium',engine:'chromium',width:1114,height:720,isMobile:true,hasTouch:true},
 {name:'desktop-webkit',engine:'webkit',width:1440,height:900},
 {name:'iphone-webkit',engine:'webkit',preset:'iPhone 13',width:390,height:844,isMobile:true,hasTouch:true},
 {name:'small-phone-webkit',engine:'webkit',width:320,height:568,isMobile:true,hasTouch:true},
 {name:'phone-landscape-webkit',engine:'webkit',preset:'iPhone 13',width:844,height:390,isMobile:true,hasTouch:true},
 {name:'ipad-webkit',engine:'webkit',preset:'iPad Pro 11',width:820,height:1180,isMobile:true,hasTouch:true},
 {name:'tablet-landscape-webkit',engine:'webkit',preset:'iPad Pro 11',width:1180,height:820,isMobile:true,hasTouch:true},
 {name:'desktop-firefox',engine:'firefox',width:1440,height:900},
];
export function contextOptions(device,playwright) {
 const {defaultBrowserType,...preset}=device.preset?playwright.devices[device.preset]:{};
 return {...preset,viewport:{width:device.width,height:device.height},isMobile:!!device.isMobile,hasTouch:!!device.hasTouch,deviceScaleFactor:1,locale:'en-PH',timezoneId:'Asia/Manila',colorScheme:'light',reducedMotion:'reduce',serviceWorkers:'block'};
}

export function targetPlan(baseUrl, isolatedUrl = 'http://localhost:3187') {
 const target = new URL(baseUrl);
 if (target.username || target.password || target.pathname !== '/' || target.search || target.hash)
   throw new Error('Expected a QA origin');
 if (approvedOrigins.includes(target.origin)) {
   return {mode:'live-smoke', devices:[deviceMatrix[0]], publicPaths:['/', '/help'],
     routes:['/home','/transactions','/split-bill'], tiers:['Pro']};
 }
 const loopback=['localhost','127.0.0.1','[::1]'].includes(target.hostname);
 if (target.origin !== new URL(isolatedUrl).origin || !(target.protocol==='https:' || (loopback && target.protocol==='http:')))
   throw new Error('Configure an isolated QA origin for the full matrix');
 return {mode:'isolated-matrix', devices:deviceMatrix, publicPaths:['/','/help','/privacy-policy','/terms-of-service'],
   routes:authenticatedRoutes, tiers:['Free','Plus','Pro']};
}
