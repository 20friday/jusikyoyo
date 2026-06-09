#!/usr/bin/env python3
"""
테드픽 자막 추출 도구
사용법:
    python3 scripts/fetch-transcripts.py <URL1> <URL2> ...
또는 URL을 한 줄에 하나씩 담은 파일:
    python3 scripts/fetch-transcripts.py --file urls.txt

동작:
    - 각 유튜브 영상에서 한국어 자막 추출 (yt-dlp + Chrome 쿠키)
    - 쇼츠(60초 이하)는 자동 제외
    - VTT 자막을 깨끗한 텍스트로 정리
    - /tmp/tedpick_transcripts/ 에 <영상ID>.txt 로 저장
    - 영상 제목·길이·업로드시각을 함께 출력
"""
import sys
import os
import re
import json
import subprocess
import tempfile

OUT_DIR = "/tmp/tedpick_transcripts"
SHORTS_MAX_SECONDS = 60  # 이 이하 길이는 쇼츠로 보고 제외


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def get_meta(url):
    """영상 메타데이터(제목, 길이, 업로드일, ID) 가져오기"""
    r = run([
        "python3", "-m", "yt_dlp",
        "--cookies-from-browser", "chrome",
        "--skip-download", "--dump-json", "--no-warnings",
        url,
    ])
    if r.returncode != 0:
        return None, r.stderr.strip()
    try:
        data = json.loads(r.stdout)
    except json.JSONDecodeError:
        return None, "메타데이터 파싱 실패"
    return {
        "id": data.get("id"),
        "title": data.get("title", ""),
        "duration": data.get("duration") or 0,
        "upload_date": data.get("upload_date", ""),
    }, None


def clean_vtt(path):
    """VTT 파일을 깨끗한 한 줄 텍스트로 변환"""
    with open(path, encoding="utf-8") as f:
        lines = f.readlines()
    out = []
    for l in lines:
        l = l.strip()
        if "-->" in l or l == "":
            continue
        if l.startswith(("WEBVTT", "Kind", "Language")):
            continue
        l = re.sub(r"<[^>]+>", "", l)
        l = l.replace("&gt;", ">").replace("&lt;", "<").replace("&amp;", "&")
        if l and (not out or out[-1] != l):
            out.append(l)
    return " ".join(out)


def fetch_subtitle(url, vid):
    """자막 다운로드 후 정리된 텍스트 반환"""
    with tempfile.TemporaryDirectory() as tmp:
        tmpl = os.path.join(tmp, "%(id)s.%(ext)s")
        r = run([
            "python3", "-m", "yt_dlp",
            "--cookies-from-browser", "chrome",
            "--skip-download",
            "--write-auto-sub", "--write-sub",
            "--sub-lang", "ko", "--sub-format", "vtt",
            "--no-warnings",
            "-o", tmpl, url,
        ])
        # 자막 파일 찾기
        for fn in os.listdir(tmp):
            if fn.endswith(".vtt"):
                return clean_vtt(os.path.join(tmp, fn)), None
        return None, "자막 파일 없음 (아직 자막이 생성되지 않았을 수 있음)"


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(1)

    urls = []
    if args[0] == "--file":
        with open(args[1], encoding="utf-8") as f:
            urls = [l.strip() for l in f if l.strip()]
    else:
        urls = args

    os.makedirs(OUT_DIR, exist_ok=True)
    results = []

    for i, url in enumerate(urls, 1):
        print(f"\n[{i}/{len(urls)}] {url}")
        meta, err = get_meta(url)
        if err:
            print(f"  ❌ 메타데이터 실패: {err}")
            results.append({"url": url, "status": "meta_fail", "error": err})
            continue

        dur = meta["duration"]
        mins = dur // 60
        secs = dur % 60
        print(f"  제목: {meta['title']}")
        print(f"  길이: {mins}분 {secs}초 / 업로드: {meta['upload_date']}")

        if dur <= SHORTS_MAX_SECONDS:
            print(f"  ⏭️  쇼츠(60초 이하) → 건너뜀")
            results.append({"url": url, "status": "skipped_short", "title": meta["title"]})
            continue

        text, err = fetch_subtitle(url, meta["id"])
        if err:
            print(f"  ⚠️  {err}")
            results.append({"url": url, "status": "no_subtitle", "title": meta["title"]})
            continue

        out_path = os.path.join(OUT_DIR, f"{meta['id']}.txt")
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(f"# {meta['title']}\n")
            f.write(f"# 길이: {mins}분 {secs}초 / 업로드: {meta['upload_date']}\n")
            f.write(f"# URL: {url}\n\n")
            f.write(text)
        print(f"  ✅ 자막 {len(text):,}자 저장 → {out_path}")
        results.append({
            "url": url, "status": "ok", "title": meta["title"],
            "chars": len(text), "path": out_path,
        })

    # 요약
    print("\n" + "=" * 50)
    print("요약")
    ok = [r for r in results if r["status"] == "ok"]
    print(f"  ✅ 자막 추출 성공: {len(ok)}개")
    print(f"  ⏭️  쇼츠 제외: {len([r for r in results if r['status']=='skipped_short'])}개")
    print(f"  ⚠️  자막 없음: {len([r for r in results if r['status']=='no_subtitle'])}개")
    print(f"  ❌ 실패: {len([r for r in results if r['status']=='meta_fail'])}개")
    print(f"\n저장 위치: {OUT_DIR}/")


if __name__ == "__main__":
    main()
