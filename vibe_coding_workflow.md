# 🌊 Vibe Coding: Collaborative Workflow

מדריך לצוות שעובד עם כלי AI (כמו Antigravity) על ההגדה.

## 1. סנכרון (בתחילת כל יום עבודה)
תמיד מתחילים במשיכת ה"וייב" האחרון מכולם:
```bash
git pull origin master
```

## 2. עבודה בענפים (Branches)
אל תכתבו על ה-`master`. פתחו ענף להמשימה שלכם:
- `feature/name-task-description`
לדוגמה: `feature/itay-sound-effects`

## 3. סנכרון ה"הקשר" (Context)
ה-AI מסתמך על התיעוד בתיקיית ה-`brain` או במסמכי ה-`md`.
- **תכנון:** בקשו מה-AI לעדכן את תוכנית העבודה (`implementation_plan.md`) לפני תחילת הקידוד.
- **סיום:** בקשו מה-AI לעדכן את ה-`walkthrough.md` בסיום כדי ששאר ה-AI של הצוות יבינו מה קרה.

## 4. מיזוג קוד (Pull Requests)
כשמסיימים משימה:
1. דוחפים את הענף ל-GitHub.
2. פותחים Pull Request.
3. שאר הצוות (וה-AI שלהם) עוברים על השינויים לפני האישור ל-`master`.

## 5. פריסה לשרת (Deployment)
רק ה-`master` עולה לשרת הייצור. אחרי המיזוג, מריצים בשרת:
```bash
cd Seder_Pesah
./deploy.sh
```

## 6. סודות (API Keys)
- שמרו מפתחות בקובץ `.env` מקומי בלבד.
- **לעולם** אל תדחפו את ה-`.env` ל-GitHub.

---

**Happy Vibe Coding! 🍷🚀**
