# 제3자 라이선스 고지

모여(Moyeo)는 아래 오픈소스 자산을 포함합니다. npm으로 설치되는 라이브러리(React, Fastify, Socket.IO 등)는
각 패키지(`node_modules/<패키지>/LICENSE`)에 라이선스가 들어 있으며, 여기에는 **소스에 직접 포함된 자산**을 적습니다.

## Feather Icons — `client/src/components/Icon.tsx`

아이콘 경로(SVG path) 대부분은 Feather Icons의 아이콘을 바탕으로 했습니다. https://github.com/feathericons/feather

```
The MIT License (MIT)

Copyright (c) 2013-2017 Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Emojibase 데이터 — 이모지 피커의 한국어 이름·검색어

`emojibase-data` 패키지(MIT, Copyright (c) 2017-2019 Miles Johnson). 이모지 이름은 Unicode CLDR 데이터를 바탕으로 합니다.
이모지 그림 자체는 앱에 포함하지 않고, 사용자의 기기(운영체제) 글꼴로 표시됩니다.

## 그 밖의 자산

- 로고, 파비콘, 빈 상태 일러스트, 색상 테마는 이 프로젝트에서 새로 만들었습니다.
- 효과음은 오디오 파일 없이 Web Audio API로 실행 중에 생성합니다.
- 글꼴은 포함하지 않고 기기에 설치된 시스템 글꼴을 사용합니다.

모여는 Discord, Kakao 등 다른 회사와 관련이 없는 독립 프로젝트입니다.
