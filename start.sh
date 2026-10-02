#!/bin/sh
# Mac / Linux: get the latest version, start everything, open the Home page.
cd "$(dirname "$0")" || exit 1
if [ -d .git ]; then
  git pull --ff-only || echo "Could not update automatically - starting with the code you have."
else
  echo "Tip: use 'git clone https://github.com/chitransh1101/Nayan.git' so updates arrive automatically."
fi
docker compose up -d --build || { echo "Is Docker running?"; exit 1; }
i=0; until curl -fs http://localhost:8000/health >/dev/null 2>&1 || [ $i -ge 60 ]; do i=$((i+1)); sleep 3; done
(open http://localhost:3000 || xdg-open http://localhost:3000) >/dev/null 2>&1
echo "Ready: http://localhost:3000"
