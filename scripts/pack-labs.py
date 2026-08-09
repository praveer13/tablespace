#!/usr/bin/env python3
"""pack-labs — zip forge lab templates into public/labs/ for download.

The zip is the student-facing workspace: kit + lab crate(s) + devcontainer +
README. Reference solutions (_solutions/) and build artifacts (target/) are
never shipped. Re-run after any change under labs/:

    python3 scripts/pack-labs.py
"""
import os
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LABS = os.path.join(ROOT, "labs")
OUT_DIR = os.path.join(ROOT, "public", "labs")

# (zip name, lab crate, extra members to include)
SHARED = [
    "README.md",
    ".gitignore",
    "AGENTS.md",
    "CLAUDE.md",
    ".devcontainer/devcontainer.json",
    "kit/Cargo.toml",
    "kit/src/lib.rs",
]


def crate_files(lab: str, edit_file: str, tests_file: str) -> list[str]:
    return [
        f"{lab}/Cargo.toml",
        f"{lab}/src/lib.rs",
        f"{lab}/src/{edit_file}",
        f"{lab}/tests/{tests_file}",
    ]


PACKAGES = [
    ("slotted-pages.zip", "slotted-pages", SHARED + crate_files("slotted-pages", "page.rs", "page_tests.rs")),
    ("btree.zip", "btree", SHARED + crate_files("btree", "tree.rs", "tree_tests.rs")),
    ("wal.zip", "wal", SHARED + crate_files("wal", "wal.rs", "wal_tests.rs")),
    ("mvcc.zip", "mvcc", SHARED + crate_files("mvcc", "mvcc.rs", "mvcc_tests.rs")),
    ("volcano.zip", "volcano", SHARED + crate_files("volcano", "executor.rs", "executor_tests.rs")),
    ("hnsw.zip", "hnsw", SHARED + crate_files("hnsw", "hnsw.rs", "hnsw_tests.rs")),
]


def workspace_toml(lab: str) -> str:
    """Each zip gets a workspace manifest naming only the crates it ships —
    the repo's manifest lists all labs and would break a standalone unzip."""
    return f'[workspace]\nmembers = ["kit", "{lab}"]\nresolver = "2"\n'


def main() -> int:
    os.makedirs(OUT_DIR, exist_ok=True)
    for zip_name, lab, members in PACKAGES:
        out = os.path.join(OUT_DIR, zip_name)
        missing = [m for m in members if not os.path.isfile(os.path.join(LABS, m))]
        if missing:
            print(f"error: missing files for {zip_name}: {missing}", file=sys.stderr)
            return 1
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("Cargo.toml", workspace_toml(lab))
            for m in members:
                z.write(os.path.join(LABS, m), arcname=m)
        size = os.path.getsize(out)
        print(f"packed {zip_name}: {len(members) + 1} files, {size} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
