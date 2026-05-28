"""
Manga data seeder: crawls Jikan API (MyAnimeList wrapper) + truyenqqko.com,
downloads thumbnails to resources/, and writes seed_data.sql.

Tables populated:
  Author, Artist, Tag, Manga,
  MangaAuthor, MangaArtist, MangaTag, MangaView, Chapter, Image
"""

import io
import json
import os
import re
import sys
import time
import uuid
import urllib.request
import urllib.error
from datetime import datetime
from html.parser import HTMLParser

# Force stdout to UTF-8 on Windows consoles
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

try:
    import requests
    from bs4 import BeautifulSoup
    HAVE_LIBS = True
except ImportError:
    HAVE_LIBS = False

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RESOURCES_DIR = os.path.join(BASE_DIR, "resources")
os.makedirs(RESOURCES_DIR, exist_ok=True)
os.makedirs(os.path.join(RESOURCES_DIR, "thumbnails"), exist_ok=True)
os.makedirs(os.path.join(RESOURCES_DIR, "chapters"), exist_ok=True)

NOW = "2026-05-27 23:00:00"
SYSTEM_USER = "system"

# ── Enum mappings (inferred from schema + API conventions) ────────────────────
COUNTRY_MAP = {
    "Japan": 0, "Japanese": 0,
    "China": 1, "Chinese": 1,
    "Korea": 2, "Korean": 2,
    "Vietnam": 3, "Vietnamese": 3,
}
STATUS_MAP  = {"Publishing": 0, "Finished": 1, "On Hiatus": 2, "Discontinued": 3}
TYPE_MAP    = {"Manga": 0, "Manhwa": 1, "Manhua": 2, "Novel": 3, "One-shot": 4, "Doujinshi": 5}


def esc(s: str) -> str:
    if s is None:
        return "NULL"
    return "N'" + str(s).replace("'", "''") + "'"


def new_id() -> str:
    return str(uuid.uuid4())


def audit(created_by: str = SYSTEM_USER) -> str:
    return f"'{NOW}', N'{created_by}', NULL, NULL, NULL, NULL"


# ── Image downloader ──────────────────────────────────────────────────────────

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Referer": "https://truyenqqko.com/",
}


def download_image(url: str, dest_path: str) -> bool:
    try:
        if HAVE_LIBS:
            r = requests.get(url, headers=HEADERS, timeout=15)
            if r.status_code == 200:
                with open(dest_path, "wb") as f:
                    f.write(r.content)
                return True
        else:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=15) as resp:
                with open(dest_path, "wb") as f:
                    f.write(resp.read())
            return True
    except Exception as e:
        print(f"  [WARN] Could not download {url}: {e}")
    return False


# ── Jikan API (MyAnimeList) ───────────────────────────────────────────────────

JIKAN_BASE = "https://api.jikan.moe/v4"

def jikan_get(path: str) -> dict:
    url = JIKAN_BASE + path
    try:
        r = requests.get(url, timeout=20)
        if r.status_code == 200:
            return r.json()
        elif r.status_code == 429:
            print("  [RATE-LIMIT] Jikan: sleeping 3s...")
            time.sleep(3)
            return jikan_get(path)
    except Exception as e:
        print(f"  [ERR] Jikan {path}: {e}")
    return {}


def fetch_mal_manga(page: int = 1, limit: int = 25) -> list[dict]:
    data = jikan_get(f"/manga?page={page}&limit={limit}&order_by=popularity&sort=asc")
    return data.get("data", [])


def parse_mal_entry(entry: dict) -> dict:
    genres  = [g["name"] for g in entry.get("genres", [])]
    themes  = [t["name"] for t in entry.get("themes", [])]
    demos   = [d["name"] for d in entry.get("demographics", [])]
    authors = entry.get("authors", [])
    raw_type = entry.get("type") or "Manga"
    status   = entry.get("status") or "Finished"
    score    = entry.get("score") or 0
    chapters = entry.get("chapters") or 0

    return {
        "mal_id":      entry.get("mal_id"),
        "title":       entry.get("title") or entry.get("title_english") or "Unknown",
        "synopsis":    (entry.get("synopsis") or "").strip(),
        "type":        TYPE_MAP.get(raw_type, 0),
        "status":      STATUS_MAP.get(status, 1),
        "country":     0,  # MAL is mostly Japanese
        "level":       0,
        "season":      0,
        "thumbnail":   (entry.get("images") or {}).get("jpg", {}).get("large_image_url"),
        "score":       score,
        "chapters":    chapters,
        "genres":      genres + themes + demos,
        "authors":     [a["name"] for a in authors],
    }


# ── truyenqqko.com scraper ────────────────────────────────────────────────────

TQQ_BASE = "https://truyenqqko.com"

def fetch_tqq_listing(page: int = 1) -> list[dict]:
    url = f"{TQQ_BASE}/truyen-moi-cap-nhat/trang-{page}.html" if page > 1 else f"{TQQ_BASE}/"
    try:
        r = requests.get(url, headers=HEADERS, timeout=20)
        if r.status_code != 200:
            return []
        soup = BeautifulSoup(r.text, "html.parser")
        items = []
        for item in soup.select(".book_avatar"):
            a = item.find("a")
            img = item.find("img")
            if a and img:
                href = a.get("href", "")
                if href.startswith("http"):
                    url = href
                else:
                    url = TQQ_BASE + href
                items.append({
                    "url":   url,
                    "thumb": img.get("src") or img.get("data-src") or "",
                    "title": img.get("alt") or a.get("title") or "",
                })
        return items
    except Exception as e:
        print(f"  [ERR] TQQ listing: {e}")
        return []


def fetch_tqq_detail(url: str) -> dict:
    try:
        r = requests.get(url, headers=HEADERS, timeout=20)
        if r.status_code != 200:
            return {}
        soup = BeautifulSoup(r.text, "html.parser")
        detail: dict = {}

        # Title
        title_el = soup.select_one("h1.book_name") or soup.select_one(".book_detail h1")
        detail["title"] = title_el.get_text(strip=True) if title_el else ""

        # Thumbnail
        thumb_el = soup.select_one(".book_avatar img") or soup.select_one(".book-detail img")
        detail["thumbnail"] = ""
        if thumb_el:
            detail["thumbnail"] = thumb_el.get("src") or thumb_el.get("data-src") or ""

        # Description
        desc_el = soup.select_one(".book_detail_description .field-value") or soup.select_one(".story-detail-info")
        detail["synopsis"] = desc_el.get_text(strip=True) if desc_el else ""

        # Meta info rows
        detail["genres"]  = []
        detail["authors"] = []
        detail["status"]  = 0
        detail["type"]    = 2  # Manhua/Manhwa or 0

        for li in soup.select(".book_other_info li"):
            label = li.select_one("b")
            value = li.select_one(".field-value")
            if not label or not value:
                continue
            label_text = label.get_text(strip=True).lower()
            if "tác giả" in label_text or "author" in label_text:
                detail["authors"] = [a.get_text(strip=True) for a in value.find_all("a")]
            elif "thể loại" in label_text or "genre" in label_text:
                detail["genres"] = [g.get_text(strip=True) for g in value.find_all("a")]
            elif "trạng thái" in label_text or "status" in label_text:
                s = value.get_text(strip=True).lower()
                detail["status"] = 0 if "đang" in s else 1

        # Chapter list (first 5 only for seeding)
        chapters = []
        for ch in soup.select(".chapter-list .row a")[:5]:
            href = ch.get("href", "")
            name = ch.get_text(strip=True)
            if href:
                chapters.append({"title": name, "url": TQQ_BASE + href if href.startswith("/") else href})
        detail["chapters"] = chapters

        return detail
    except Exception as e:
        print(f"  [ERR] TQQ detail {url}: {e}")
        return {}


# ── SQL builders ──────────────────────────────────────────────────────────────

class SqlWriter:
    def __init__(self):
        self.lines: list[str] = []
        self.tag_ids:    dict[str, str] = {}  # name -> id
        self.author_ids: dict[str, str] = {}  # name -> id
        self.artist_ids: dict[str, str] = {}  # name -> id (reuse authors as artists)

    def header(self):
        self.lines += [
            "USE [Yahallo]",
            "GO",
            "SET NOCOUNT ON;",
            "",
            "-- ================================================================",
            "-- Seed data generated by crawl_seed.py",
            f"-- Generated: {NOW}",
            "-- ================================================================",
            "",
        ]

    def tag(self, name: str) -> str:
        if name in self.tag_ids:
            return self.tag_ids[name]
        tid = new_id()
        self.tag_ids[name] = tid
        self.lines.append(
            f"INSERT INTO [dbo].[Tag] ([Id],[Name],[Description],[CreateDate],[IdUserCreate],[UpdateDate],[IdUserUpdate],[DeleteDate],[IdUserDelete]) "
            f"VALUES ({esc(tid)},{esc(name)},NULL,{audit()});"
        )
        return tid

    def author(self, name: str, country: int = 0) -> str:
        key = name.strip()
        if key in self.author_ids:
            return self.author_ids[key]
        aid = new_id()
        self.author_ids[key] = aid
        self.lines.append(
            f"INSERT INTO [dbo].[Author] ([Id],[Name],[Countries],[Depscription],[Birth],[LifeStatus],[CreateDate],[IdUserCreate],[UpdateDate],[IdUserUpdate],[DeleteDate],[IdUserDelete]) "
            f"VALUES ({esc(aid)},{esc(key)},{country},N'','{NOW}',0,{audit()});"
        )
        return aid

    def artist(self, name: str, country: int = 0) -> str:
        key = name.strip()
        if key in self.artist_ids:
            return self.artist_ids[key]
        artid = new_id()
        self.artist_ids[key] = artid
        self.lines.append(
            f"INSERT INTO [dbo].[Artist] ([Id],[Name],[Countries],[Depscription],[Birth],[LifeStatus],[CreateDate],[IdUserCreate],[UpdateDate],[IdUserUpdate],[DeleteDate],[IdUserDelete]) "
            f"VALUES ({esc(artid)},{esc(key)},{country},N'','{NOW}',0,{audit()});"
        )
        return artid

    def manga(self, name: str, desc: str, level: int, status: int,
              mtype: int, country: int, season: int = 0,
              thumb_local: str = "") -> str:
        mid = new_id()
        self.lines.append(
            f"INSERT INTO [dbo].[Manga] ([Id],[Name],[Description],[Level],[Status],[Type],[Countries],[Season],[MangaSeasonId],[UserId],[CreateDate],[IdUserCreate],[UpdateDate],[IdUserUpdate],[DeleteDate],[IdUserDelete]) "
            f"VALUES ({esc(mid)},{esc(name)},{esc(desc)},{level},{status},{mtype},{country},{season},NULL,NULL,{audit()});"
        )
        if thumb_local:
            img_id = new_id()
            local_path = thumb_local.replace("\\", "/")
            self.lines.append(
                f"INSERT INTO [dbo].[Image] ([Id],[Index],[BaseUrl],[CloudUrl],[TypeImage],[UserId],[ChapterId],[MangaId],[CreateDate],[IdUserCreate],[UpdateDate],[IdUserUpdate],[DeleteDate],[IdUserDelete]) "
                f"VALUES ({esc(img_id)},0,{esc(local_path)},NULL,0,NULL,NULL,{esc(mid)},{audit()});"
            )
        return mid

    def manga_view(self, manga_id: str, views: int):
        self.lines.append(
            f"INSERT INTO [dbo].[MangaView] ([MangaId],[View],[CreateDate],[IdUserCreate],[UpdateDate],[IdUserUpdate],[DeleteDate],[IdUserDelete]) "
            f"VALUES ({esc(manga_id)},{views},{audit()});"
        )

    def manga_tag(self, manga_id: str, tag_id: str):
        self.lines.append(
            f"INSERT INTO [dbo].[MangaTag] ([MangaId],[TagId],[CreateDate],[IdUserCreate],[UpdateDate],[IdUserUpdate],[DeleteDate],[IdUserDelete]) "
            f"VALUES ({esc(manga_id)},{esc(tag_id)},{audit()});"
        )

    def manga_author(self, manga_id: str, author_id: str):
        self.lines.append(
            f"INSERT INTO [dbo].[MangaAuthor] ([MangaId],[AuthorId],[CreateDate],[IdUserCreate],[UpdateDate],[IdUserUpdate],[DeleteDate],[IdUserDelete]) "
            f"VALUES ({esc(manga_id)},{esc(author_id)},{audit()});"
        )

    def manga_artist(self, manga_id: str, artist_id: str):
        self.lines.append(
            f"INSERT INTO [dbo].[MangaArtist] ([MangaId],[ArtistId],[CreateDate],[IdUserCreate],[UpdateDate],[IdUserUpdate],[DeleteDate],[IdUserDelete]) "
            f"VALUES ({esc(manga_id)},{esc(artist_id)},{audit()});"
        )

    def chapter(self, manga_id: str, index: int, title: str) -> str:
        cid = new_id()
        self.lines.append(
            f"INSERT INTO [dbo].[Chapter] ([Id],[Title],[Index],[MangaId],[CreateDate],[IdUserCreate],[UpdateDate],[IdUserUpdate],[DeleteDate],[IdUserDelete]) "
            f"VALUES ({esc(cid)},{esc(title)},{index},{esc(manga_id)},{audit()});"
        )
        return cid

    def section(self, label: str):
        self.lines += ["", f"-- ── {label} " + "─" * (60 - len(label)), ""]

    def write(self, path: str):
        with open(path, "w", encoding="utf-8") as f:
            f.write("\n".join(self.lines))
        print(f"\n[OK] SQL written → {path}")


# ── Hardcoded fallback data (used when crawling fails) ────────────────────────

FALLBACK_MANGA = [
    {
        "title": "One Piece",
        "synopsis": "Monkey D. Luffy sets off on a journey to find the legendary One Piece treasure and become King of the Pirates.",
        "type": 0, "status": 0, "country": 0, "level": 0, "season": 0,
        "genres": ["Action", "Adventure", "Fantasy", "Shounen"],
        "authors": ["Oda Eiichiro"],
        "thumb_url": "https://cdn.myanimelist.net/images/manga/2/253146l.jpg",
        "score": 9.2, "num_chapters": 1100,
    },
    {
        "title": "Naruto",
        "synopsis": "Naruto Uzumaki, a young ninja who seeks recognition from his peers and dreams of becoming the Hokage, the leader of his village.",
        "type": 0, "status": 1, "country": 0, "level": 0, "season": 0,
        "genres": ["Action", "Adventure", "Martial Arts", "Shounen"],
        "authors": ["Kishimoto Masashi"],
        "thumb_url": "https://cdn.myanimelist.net/images/manga/3/249658l.jpg",
        "score": 8.1, "num_chapters": 700,
    },
    {
        "title": "Demon Slayer: Kimetsu no Yaiba",
        "synopsis": "Tanjiro Kamado sets off on a journey to cure his sister Nezuko, who has been turned into a demon, and avenge his family.",
        "type": 0, "status": 1, "country": 0, "level": 0, "season": 0,
        "genres": ["Action", "Adventure", "Historical", "Shounen", "Supernatural"],
        "authors": ["Gotouge Koyoharu"],
        "thumb_url": "https://cdn.myanimelist.net/images/manga/3/179023l.jpg",
        "score": 8.9, "num_chapters": 205,
    },
    {
        "title": "Attack on Titan",
        "synopsis": "In a world where humanity lives behind walls to protect themselves from giant humanoid creatures called Titans, Eren Yeager joins the military to fight back.",
        "type": 0, "status": 1, "country": 0, "level": 1, "season": 0,
        "genres": ["Action", "Drama", "Mystery", "Seinen", "Supernatural"],
        "authors": ["Isayama Hajime"],
        "thumb_url": "https://cdn.myanimelist.net/images/manga/2/37846l.jpg",
        "score": 9.0, "num_chapters": 139,
    },
    {
        "title": "My Hero Academia",
        "synopsis": "In a world where people with superpowers known as 'Quirks' are the norm, a boy born without superpowers still dreams of becoming a hero.",
        "type": 0, "status": 1, "country": 0, "level": 0, "season": 0,
        "genres": ["Action", "Comedy", "School", "Shounen", "Super Power"],
        "authors": ["Horikoshi Kouhei"],
        "thumb_url": "https://cdn.myanimelist.net/images/manga/1/209370l.jpg",
        "score": 8.0, "num_chapters": 430,
    },
    {
        "title": "Solo Leveling",
        "synopsis": "In a world where hunters must battle deadly monsters to protect humanity, Sung Jin-Woo, the world's weakest hunter, discovers a mysterious power.",
        "type": 1, "status": 1, "country": 2, "level": 1, "season": 0,
        "genres": ["Action", "Adventure", "Fantasy", "Manhwa"],
        "authors": ["Chugong"],
        "thumb_url": "https://cdn.myanimelist.net/images/manga/3/222295l.jpg",
        "score": 8.5, "num_chapters": 179,
    },
    {
        "title": "Tower of God",
        "synopsis": "A boy named Twenty-Fifth Bam enters a mysterious tower that promises to grant any wish to those who reach the top.",
        "type": 1, "status": 0, "country": 2, "level": 1, "season": 0,
        "genres": ["Action", "Adventure", "Fantasy", "Manhwa"],
        "authors": ["SIU"],
        "thumb_url": "https://cdn.myanimelist.net/images/manga/1/186297l.jpg",
        "score": 8.4, "num_chapters": 600,
    },
    {
        "title": "The God of High School",
        "synopsis": "Jin Mo-Ri participates in a tournament called 'The God of High School' where competitors use their own styles of martial arts.",
        "type": 1, "status": 1, "country": 2, "level": 1, "season": 0,
        "genres": ["Action", "Adventure", "Martial Arts", "Manhwa", "Supernatural"],
        "authors": ["Park Yong-Je"],
        "thumb_url": "https://cdn.myanimelist.net/images/manga/1/230753l.jpg",
        "score": 7.9, "num_chapters": 570,
    },
    {
        "title": "Fullmetal Alchemist",
        "synopsis": "Two brothers seek the Philosopher's Stone to restore their bodies after a failed alchemy experiment.",
        "type": 0, "status": 1, "country": 0, "level": 0, "season": 0,
        "genres": ["Action", "Adventure", "Fantasy", "Military", "Shounen"],
        "authors": ["Arakawa Hiromu"],
        "thumb_url": "https://cdn.myanimelist.net/images/manga/3/243675l.jpg",
        "score": 9.1, "num_chapters": 108,
    },
    {
        "title": "Dragon Ball",
        "synopsis": "Son Goku's adventures begin as a young boy searching for the seven Dragon Balls alongside new friends.",
        "type": 0, "status": 1, "country": 0, "level": 0, "season": 0,
        "genres": ["Action", "Adventure", "Comedy", "Fantasy", "Shounen"],
        "authors": ["Toriyama Akira"],
        "thumb_url": "https://cdn.myanimelist.net/images/manga/2/54529l.jpg",
        "score": 8.7, "num_chapters": 519,
    },
    {
        "title": "Bleach",
        "synopsis": "Ichigo Kurosaki becomes a substitute Soul Reaper after obtaining the powers of Soul Reaper Rukia Kuchiki.",
        "type": 0, "status": 1, "country": 0, "level": 0, "season": 0,
        "genres": ["Action", "Adventure", "Shounen", "Supernatural"],
        "authors": ["Kubo Tite"],
        "thumb_url": "https://cdn.myanimelist.net/images/manga/3/23191l.jpg",
        "score": 8.0, "num_chapters": 686,
    },
    {
        "title": "Death Note",
        "synopsis": "A high school student discovers a supernatural notebook that allows him to kill anyone whose name he writes in it.",
        "type": 0, "status": 1, "country": 0, "level": 1, "season": 0,
        "genres": ["Mystery", "Police", "Psychological", "Seinen", "Supernatural", "Thriller"],
        "authors": ["Obata Takeshi", "Ohba Tsugumi"],
        "thumb_url": "https://cdn.myanimelist.net/images/manga/2/54453l.jpg",
        "score": 8.7, "num_chapters": 108,
    },
    {
        "title": "Vinland Saga",
        "synopsis": "A young man named Thorfinn joins the Vikings to avenge his father's death in a story spanning the Viking Age.",
        "type": 0, "status": 0, "country": 0, "level": 1, "season": 0,
        "genres": ["Action", "Adventure", "Drama", "Historical", "Seinen"],
        "authors": ["Yukimura Makoto"],
        "thumb_url": "https://cdn.myanimelist.net/images/manga/2/188925l.jpg",
        "score": 8.9, "num_chapters": 200,
    },
    {
        "title": "Vagabond",
        "synopsis": "Based on the life of Miyamoto Musashi, the greatest swordsman in Japanese history.",
        "type": 0, "status": 2, "country": 0, "level": 2, "season": 0,
        "genres": ["Action", "Adventure", "Drama", "Historical", "Martial Arts", "Seinen"],
        "authors": ["Inoue Takehiko"],
        "thumb_url": "https://cdn.myanimelist.net/images/manga/1/259070l.jpg",
        "score": 9.2, "num_chapters": 327,
    },
    {
        "title": "Berserk",
        "synopsis": "Guts, a lone mercenary, battles demonic forces in a dark fantasy world while seeking revenge on his former friend Griffith.",
        "type": 0, "status": 0, "country": 0, "level": 2, "season": 0,
        "genres": ["Action", "Adventure", "Dark Fantasy", "Horror", "Seinen", "Supernatural"],
        "authors": ["Miura Kentaro"],
        "thumb_url": "https://cdn.myanimelist.net/images/manga/1/157897l.jpg",
        "score": 9.5, "num_chapters": 374,
    },
    {
        "title": "Spy x Family",
        "synopsis": "A spy on a mission must create a fake family, not knowing that his adopted daughter is a telepath and his fake wife is an assassin.",
        "type": 0, "status": 0, "country": 0, "level": 0, "season": 0,
        "genres": ["Action", "Comedy", "Family", "Shounen"],
        "authors": ["Endo Tatsuya"],
        "thumb_url": "https://cdn.myanimelist.net/images/manga/1/267994l.jpg",
        "score": 8.6, "num_chapters": 100,
    },
    {
        "title": "Chainsaw Man",
        "synopsis": "Denji, a poverty-stricken boy who hunts demons with his demon dog Pochita, makes a deal that transforms him into the Chainsaw Man.",
        "type": 0, "status": 0, "country": 0, "level": 2, "season": 0,
        "genres": ["Action", "Horror", "Seinen", "Supernatural"],
        "authors": ["Fujimoto Tatsuki"],
        "thumb_url": "https://cdn.myanimelist.net/images/manga/3/216464l.jpg",
        "score": 8.7, "num_chapters": 150,
    },
    {
        "title": "Jujutsu Kaisen",
        "synopsis": "A boy swallows a cursed talisman - the finger of a demon - and winds up in a school for sorcerers.",
        "type": 0, "status": 0, "country": 0, "level": 1, "season": 0,
        "genres": ["Action", "School", "Shounen", "Supernatural"],
        "authors": ["Akutami Gege"],
        "thumb_url": "https://cdn.myanimelist.net/images/manga/3/216464l.jpg",
        "score": 8.7, "num_chapters": 250,
    },
    {
        "title": "Hunter x Hunter",
        "synopsis": "Gon Freecss discovers that his father, who left him as a child, is actually a world-renowned Hunter and decides to take the same path.",
        "type": 0, "status": 0, "country": 0, "level": 1, "season": 0,
        "genres": ["Action", "Adventure", "Fantasy", "Shounen"],
        "authors": ["Togashi Yoshihiro"],
        "thumb_url": "https://cdn.myanimelist.net/images/manga/1/265631l.jpg",
        "score": 9.1, "num_chapters": 400,
    },
    {
        "title": "Black Clover",
        "synopsis": "Asta and Yuno were abandoned as newborns at the same church. While Yuno is talented at magic, Asta cannot use it at all.",
        "type": 0, "status": 0, "country": 0, "level": 0, "season": 0,
        "genres": ["Action", "Fantasy", "Magic", "Shounen"],
        "authors": ["Tabata Yuuki"],
        "thumb_url": "https://cdn.myanimelist.net/images/manga/1/209070l.jpg",
        "score": 8.1, "num_chapters": 370,
    },
]

COMMON_TAGS = [
    "Action", "Adventure", "Fantasy", "Shounen", "Seinen", "Shoujo",
    "Romance", "Comedy", "Drama", "Mystery", "Horror", "Psychological",
    "Supernatural", "Martial Arts", "School", "Historical", "Military",
    "Super Power", "Sci-Fi", "Slice of Life", "Manhwa", "Manhua",
    "Sports", "Cooking", "Music", "Mecha", "Harem", "Ecchi",
]


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    sql = SqlWriter()
    sql.header()

    # 1. Tags
    sql.section("Tags")
    for tag_name in COMMON_TAGS:
        sql.tag(tag_name)

    # 2. Try live Jikan API first
    live_data: list[dict] = []
    print("\n[INFO] Fetching live data from Jikan (MyAnimeList)...")
    if HAVE_LIBS:
        try:
            for page in range(1, 3):
                entries = fetch_mal_manga(page=page, limit=25)
                for e in entries:
                    live_data.append(parse_mal_entry(e))
                print(f"  Jikan page {page}: {len(entries)} entries")
                time.sleep(1)
        except Exception as ex:
            print(f"  [WARN] Jikan failed: {ex}")

    # 3. Try truyenqqko.com
    tqq_data: list[dict] = []
    print("\n[INFO] Fetching live data from truyenqqko.com...")
    if HAVE_LIBS:
        try:
            listing = fetch_tqq_listing(1)
            print(f"  TQQ listing: {len(listing)} items")
            for item in listing[:10]:
                detail = fetch_tqq_detail(item["url"])
                if detail.get("title"):
                    detail.setdefault("thumb_url", item.get("thumb", ""))
                    detail.setdefault("score", 0)
                    detail.setdefault("num_chapters", 0)
                    detail.setdefault("type", 2)
                    detail.setdefault("country", 3)
                    detail.setdefault("level", 0)
                    detail.setdefault("season", 0)
                    tqq_data.append(detail)
                time.sleep(0.5)
        except Exception as ex:
            print(f"  [WARN] TQQ failed: {ex}")

    # 4. Merge: prefer live data, fall back to hardcoded
    all_manga: list[dict] = []

    if live_data:
        print(f"\n[INFO] Using {len(live_data)} Jikan entries")
        all_manga.extend(live_data)
    else:
        print("\n[INFO] Jikan unavailable – using hardcoded fallback data")
        all_manga.extend(FALLBACK_MANGA)

    if tqq_data:
        print(f"[INFO] Adding {len(tqq_data)} TQQ entries")
        all_manga.extend(tqq_data)

    # 5. Insert Authors, Artists, Manga
    sql.section("Authors & Artists")
    sql.section("Manga + MangaAuthor + MangaArtist + MangaTag")

    print(f"\n[INFO] Inserting {len(all_manga)} manga records...")

    for idx, m in enumerate(all_manga):
        title = (m.get("title") or "").strip()
        if not title:
            continue

        synopsis = (m.get("synopsis") or "").strip()[:4000]
        mtype   = int(m.get("type", 0))
        status  = int(m.get("status", 0))
        country = int(m.get("country", 0))
        level   = int(m.get("level", 0))
        season  = int(m.get("season", 0))
        thumb_url = m.get("thumb_url") or m.get("thumbnail") or ""
        score   = int(float(m.get("score", 0)) * 10)
        num_ch  = int(m.get("num_chapters") or m.get("chapters") or 0)

        # Download thumbnail
        thumb_local = ""
        if thumb_url:
            ext = ".jpg"
            safe_name = re.sub(r'[^a-z0-9]', '_', title.lower())[:60]
            fname = f"{safe_name}_{idx}{ext}"
            dest = os.path.join(RESOURCES_DIR, "thumbnails", fname)
            if download_image(thumb_url, dest):
                thumb_local = f"resources/thumbnails/{fname}"
            time.sleep(0.3)

        # Insert manga
        mid = sql.manga(title, synopsis, level, status, mtype, country, season, thumb_local)

        # Views (based on score/popularity)
        views = max(score * 100, 1000) if score else 5000
        sql.manga_view(mid, views)

        # Authors
        author_names = m.get("authors", [])
        if isinstance(author_names, str):
            author_names = [author_names]
        for aname in author_names:
            if aname:
                aid = sql.author(aname, country)
                sql.manga_author(mid, aid)
                artid = sql.artist(aname, country)
                sql.manga_artist(mid, artid)

        # Tags/Genres
        genres = m.get("genres", [])
        if isinstance(genres, str):
            genres = [genres]
        for genre in genres:
            if genre:
                tid = sql.tag(genre)
                sql.manga_tag(mid, tid)

        # Stub chapters (first 3 chapters for seeding)
        ch_count = min(num_ch if num_ch > 0 else 3, 3)
        for ci in range(1, ch_count + 1):
            sql.chapter(mid, ci, f"Chapter {ci}")

        safe_title = title.encode("ascii", "replace").decode("ascii")
        print(f"  [{idx+1}/{len(all_manga)}] {safe_title}")

    sql.write(os.path.join(BASE_DIR, "seed_data.sql"))
    print(f"\n[DONE] Resources saved to: {RESOURCES_DIR}")
    print(f"[DONE] Run seed_data.sql against your Yahallo database to populate it.")


if __name__ == "__main__":
    main()
