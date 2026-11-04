# MedTerm-KR 안드로이드 앱 (android-app)

`web-react` 에서 만든 화면(`dist/MedTerm-KR_app.html`)을 그대로 담아 휴대폰에 설치하는 앱입니다. 정보 제공용이며 진단·처방·개인별 복용량 판단에 쓰지 않습니다. 근거 기반 질의 탭의 LLM 질의문·답변은 리서치용입니다.

## 특징
- 화면 · 사전 데이터 · 검증 규칙이 모두 앱 안(`app/src/main/assets/index.html`)에 있습니다. **인터넷 권한을 넣지 않았으므로** 앱이 바깥으로 보내는 통신이 없고, 인터넷이 없어도 동작합니다.
- 안드로이드 8.0(API 26) 이상, Java + 기본 WebView. 외부 라이브러리는 하나도 없습니다(글꼴을 화면 안에 담아 APK 약 1.0 MB).
- 기기가 다크 모드면 화면도 다크로 바뀝니다(색은 `web-react/tokens.json` 과 같은 값). 상태 표시줄·아래 막대 색도 맞춥니다.
- 뒤로 가기는 화면 안의 이동(성분 선택 등)을 먼저 되돌리고, 더 갈 곳이 없으면 앱이 닫힙니다.
- 웹 주소·메일·전화 링크는 기기의 다른 앱(브라우저 등)으로 넘기고, 그 밖의 주소는 막습니다.
- "근거 기반 질의" 탭의 서버 프록시(LLM 호출) 입력칸은 이 앱에서 숨겨져 있습니다. 리서치 질의문 만들기와, 답변을 붙여넣어 검증하는 것은 그대로 됩니다.
- 참고: 화면은 기기에 설치된 **Android System WebView** 로 그려집니다. 오래된 WebView(크롬 100 미만)에서는 화면이 깨질 수 있으니 Play 스토어에서 WebView·크롬을 최신으로 두세요.

## 휴대폰에 설치하기
1. `MedTerm-KR.apk`(저장소 Actions 로 만들었거나 따로 받은 파일)를 휴대폰으로 옮깁니다.
2. 파일을 열어 설치합니다. "이 출처의 앱 설치 허용"을 물으면 허용합니다. 개인 확인용 서명이라 Play 프로텍트가 "확인되지 않은 앱" 경고를 보일 수 있습니다.
3. 같은 앱이 **다른 서명**으로 이미 깔려 있으면(예: 다른 곳에서 빌드한 APK) "앱이 설치되지 않음"이 나옵니다. 먼저 삭제한 뒤 설치하세요.

## 다시 만들기
화면(`web-react`)을 바꿨다면 새로 빌드해서 앱에 넣고 APK 를 만듭니다. JDK 17 이상과 안드로이드 SDK 34(`ANDROID_HOME`)가 필요합니다.
```
cd web-react && npm ci && npm run build && cd ..
cp web-react/dist/MedTerm-KR_app.html android-app/app/src/main/assets/index.html
cd android-app && ./gradlew assembleRelease
# → app/build/outputs/apk/release/app-release.apk
```
GitHub 저장소에서 만들려면 `.github/workflows/android-apk.yml` 을 씁니다: 저장소 → Actions → **android-apk** → Run workflow(수동 실행만, 자동으로 돌지 않음). 끝나면 실행 결과 아래 Artifacts 의 `MedTerm-KR-apk` 를 내려받습니다.

## 서명에 대해 (중요)
- 지금은 **개인 확인용**으로 디버그 키에 서명합니다(`app/build.gradle` 의 `signingConfig signingConfigs.debug`). 디버그 키는 빌드하는 컴퓨터마다 달라서, 다른 곳에서 만든 APK 로는 "업데이트 설치"가 안 됩니다(삭제 후 설치).
- 계속 업데이트하거나 Play 스토어 등에 내려면 정식 서명 키를 따로 만들어 연결해야 합니다. 키 파일과 비밀번호는 저장소에 올리지 않습니다(GitHub Secrets 사용).

## 바꿀 수 있는 것
- 앱 ID: `app/build.gradle` 의 `applicationId` · `namespace` 와 폴더 `app/src/main/java/kr/medit/medtermkr`(바꾸면 함께). 지금 값은 임시 이름입니다.
- 버전: `versionCode`(숫자, 올릴 때마다 +1) · `versionName`(화면 상단에 보이는 `web-react/package.json` 의 `version` 과 같게 맞춥니다 — `web-react/tests/app_html.cjs` 가 둘이 같은지 확인).
- 아이콘: `app/src/main/res/drawable/ic_launcher_foreground.xml`(틸 바탕 위의 알약, 2026-11-04 에 메디노트 색으로 변경) · 바탕색 `values/colors.xml`.

## 확인한 것과 확인하지 못한 것 (2026-11-04)
- 확인함: 이 작업 환경(리눅스, JDK 21, Gradle 8.14.3, 안드로이드 Gradle 플러그인 8.7.3)에서 `assembleRelease` 가 성공했습니다. APK 를 점검한 결과 — 패키지 `kr.medit.medtermkr` · 버전 **1.0.0(4)**(2026-11-04 실사용판 표기·리서치용 질의 반영; 이전 0.1.0(1) · 0.1.1(2) · 0.1.2(3)) · minSdk 26 · targetSdk 34 · **요청 권한 없음** · 시작 화면 `MainActivity` · APK 서명(v2) 확인(디버그 키의 인증서 SHA-256 이 이전 판과 같아서 이전 판 위에 덮어 설치됨) · `assets/index.html` 이 `dist/MedTerm-KR_app.html` 과 바이트까지 같음.
- 확인함: 같은 화면 파일을 데스크톱 크롬에서 휴대폰 폭(390·360px)으로 열어 30개 점검 통과(`web-react/tests/app_html.cjs`).
- **확인하지 못함**: 실제 휴대폰·에뮬레이터에서 설치해 실행해 보는 것. 이 환경에서는 에뮬레이터를 돌릴 수 없었습니다. WebView 고유의 동작(뒤로 가기, 외부 링크 넘기기, 상태 표시줄 색, 기기 글꼴 크기 설정에 따른 모양)은 설치 후 직접 확인해 주세요. 이상이 있으면 알려 주세요.
- `.github/workflows/android-apk.yml` 은 이 환경에서 실행해 보지 못했습니다(같은 명령 `./gradlew assembleRelease` 는 위와 같이 확인).
