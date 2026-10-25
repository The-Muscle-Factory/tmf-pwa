#!/usr/bin/env python3
"""Rebuild data/exercises.json from free-exercise-db (public domain, Unlicense).

    python3 tools/build-exercises.py

Source: https://github.com/yuhonas/free-exercise-db
"""
import json
import pathlib
import urllib.request

SRC = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json"
OUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "exercises.json"

# Dataset equipment -> the app's equipment options.
EQUIPMENT = {
    "barbell": "Barbell",
    "dumbbell": "Dumbbell",
    "cable": "Cable",
    "machine": "Machine",
    "body only": "Bodyweight",
    "kettlebells": "Kettlebell",
    "bands": "Band",
    "e-z curl bar": "EZ Bar",
}

with urllib.request.urlopen(SRC) as res:
    raw = json.load(res)

out = []
for x in raw:
    out.append({
        "id": x["id"],
        "name": x["name"],
        "equipment": "Cardio" if x["category"] == "cardio" else EQUIPMENT.get(x["equipment"], "Other"),
        "category": x["category"],
        "level": x["level"],
        "primary": x["primaryMuscles"],
        "secondary": x["secondaryMuscles"],
        "instructions": x["instructions"],
        "images": x["images"],
    })
out.sort(key=lambda x: x["name"].lower())
OUT.write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False))
print(f"{len(out)} exercises -> {OUT}")
