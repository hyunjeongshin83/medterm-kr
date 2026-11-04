/* global __APP_VERSION__ */
// 화면에 보이는 버전은 web-react/package.json 의 "version" 한 곳에서만 정한다(build.mjs 가 빌드 때 이 상수로 바꿔 넣는다).
// 안드로이드 앱의 versionName(android-app/app/build.gradle)은 같은 값으로 맞추고, tests/app_html.cjs 가 둘이 같은지 확인한다.
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
