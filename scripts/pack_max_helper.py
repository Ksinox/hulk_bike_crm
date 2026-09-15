# -*- coding: utf-8 -*-
"""Собирает дополнение в zip и кладёт его в статику CRM.

Пока расширение не опубликовано в магазине, оператор скачивает архив с
самой CRM. Тот же zip загружается в Chrome Web Store при публикации.
"""
import io, os, shutil, zipfile

SRC = 'apps/max-helper'
OUT_DIR = 'apps/web/public'
ZIP = os.path.join(OUT_DIR, 'max-helper.zip')

files = []
for root, _dirs, names in os.walk(SRC):
    for n in names:
        p = os.path.join(root, n)
        files.append((p, os.path.relpath(p, SRC).replace(os.sep, '/')))

os.makedirs(OUT_DIR, exist_ok=True)
with zipfile.ZipFile(ZIP, 'w', zipfile.ZIP_DEFLATED) as z:
    for path, arc in sorted(files, key=lambda x: x[1]):
        z.write(path, arc)

print('в архиве:', ', '.join(sorted(a for _p, a in files)))
print('готово:', ZIP, os.path.getsize(ZIP), 'байт')
