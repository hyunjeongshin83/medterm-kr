# fonts — 화면 글꼴 (MediNote 와 같은 글꼴)

화면 글꼴은 메디노트(MediNote)와 같은 **Pretendard** 입니다. 빌드가 이 폴더의 woff2 를 읽어 각 HTML 안에 base64 로 담으므로
**외부 글꼴 서버(Google Fonts 등)에 접속하지 않고**, 인터넷이 없어도 같은 글꼴로 보입니다.

| 파일 | 내용 | 출처·라이선스 |
|---|---|---|
| `Pretendard-Regular.subset.woff2` · `-SemiBold` · `-Bold` | 본문 400 · 중간 600 · 굵게 700. 한글 2,780자 + 영문·기호 | npm `pretendard` 1.3.9 `dist/web/static/woff2-subset/` 의 배포 파일 **그대로**(메디노트 `vendor/fonts/` 와 내용이 같음, sha256 일치). SIL OFL 1.1 — `OFL-Pretendard.txt` |
| `Gaegu-Bold.accent.woff2` | 로고 글씨(「MedTerm-KR」) 한 곳에만 쓰는 손글씨체. 영문·숫자·기호 94자만 담음(16 KB) | 메디노트 `vendor/fonts/Gaegu-Bold.subset.woff2`(Google Fonts 의 Gaegu v23 를 줄인 것)를 `pyftsubset` 로 더 줄임. SIL OFL 1.1 — `OFL-Gaegu.txt` |

## 알아 둘 점
- 줄인 글자 목록 밖의 글자(예: `⌘` `└` `✕` `㎍`)는 기기 글꼴로 보입니다. 이 화면의 한글 495자는 모두 Pretendard 안에 있음을 계산으로 확인했습니다(`tests/ui.cjs` 의 「글꼴」 점검이 화면 글자를 다시 확인).
- Gaegu 는 로고 글씨만 씁니다. 약 이름·수치 등 읽는 정보에는 쓰지 않습니다. Gaegu 에 없는 글자는 Pretendard 로 대신 보입니다(글꼴 목록 순서).
- Pretendard 는 「Reserved Font Name」이 있어 파일을 고쳐 쓰면 안 됩니다. 배포 파일을 그대로 두세요(Gaegu 는 해당 없음).

## Gaegu 를 다시 줄이려면
```
pip install fonttools brotli
pyftsubset <메디노트>/vendor/fonts/Gaegu-Bold.subset.woff2 --unicodes="U+0020-007E,U+00B7" --flavor=woff2 --layout-features='kern,liga' --output-file=Gaegu-Bold.accent.woff2
```
