const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');

const app = express();
const port = 3001;

const db = new sqlite3.Database('./database.db');

db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS albums (id INTEGER PRIMARY KEY AUTOINCREMENT, artist TEXT, album TEXT, cover TEXT, country TEXT, youtube_link TEXT, year INTEGER, listened INTEGER DEFAULT 0)");
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const uploadDir = path.join(__dirname, 'uploads');
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});
const upload = multer({ storage: storage });

const secretKey = "1111"; // Секретний ключ для авторизації

// Функція для перевірки прав доступу до додавання альбомів
const checkAuthorization = (req, res, next) => {
    const { authorization } = req.headers;
    if (authorization && authorization === secretKey) {
        // Користувач має права доступу
        next();
    } else {
        // Користувач не авторизований або неправильний секретний ключ
        res.status(401).send('Не авторизований');
    }
};

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    next();
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.post('/api/login', (req, res) => {
    const { password } = req.body;
    if (!password) {
        res.status(400).send('Не вказано пароль');
    } else if (password === secretKey) {
        res.status(200).send('Успішний вхід');
    } else {
        res.status(401).send('Неправильний пароль');
    }
});

app.route('/api/albums')
    .get((req, res) => {
        const { type, sort, searchArtist, searchAlbum, searchCountry, searchYear } = req.query;
        console.log("Тип запиту:", type);
        console.log("Параметр сортування:", sort);
        console.log("Пошук виконавця:", searchArtist);
        console.log("Пошук альбому:", searchAlbum);
        console.log("Пошук країни:", searchCountry);
        console.log("Пошук за рік:", searchYear);

        let sql;
        if (type === 'listened') {
            sql = `SELECT * FROM albums WHERE listened = 1`;
        } else if (type === 'to-listen') {
            sql = `SELECT * FROM albums WHERE listened = 2`;
        } else {
            res.status(400).send('Неправильний запит');
            return;
        }

        if (searchArtist) {
            sql += ` AND artist LIKE '%${searchArtist}%'`;
        }
        if (searchAlbum) {
            sql += ` AND album LIKE '%${searchAlbum}%'`;
        }
        if (searchCountry) {
            sql += ` AND country LIKE '%${searchCountry}%'`;
        }
        if (searchYear) {
            sql += ` AND year = ${searchYear}`;
        }

        if (sort) {
            sql += ` ORDER BY ${sort}`;
        }

        db.all(sql, (err, rows) => {
            if (err) {
                console.error(err.message);
                res.status(500).send('Помилка сервера');
            } else {
                console.log("Результат запиту до бази даних:", rows);
                res.json(rows);
            }
        });
    })
    .post(checkAuthorization, upload.single('cover'), (req, res) => { // Додано функцію перевірки авторизації
        console.log(req.body);
        const { action, listened } = req.body;
        console.log("action:", action);
        console.log("listened:", listened);
        if (action === 'add') {
            const { artist, album, country, youtube_link, year } = req.body;
            const listenedValue = listened || 1;
            const cover = req.file ? `http://localhost:3001/uploads/${req.file.filename}` : '';

            console.log("Дані, які надійшли з клієнтського додатку:");
            console.log("Виконавець:", artist);
            console.log("Альбом:", album);
            console.log("Країна:", country);
            console.log("Посилання на YouTube:", youtube_link);
            console.log("Рік:", year);
            console.log("Чи прослуханий:", listenedValue);
            console.log("Шлях до обкладинки:", cover);

            db.run("INSERT INTO albums (artist, album, cover, country, youtube_link, year, listened) VALUES (?, ?, ?, ?, ?, ?, ?)",
                [artist, album, cover, country, youtube_link, year, listenedValue],
                (err) => {
                    if (err) {
                        console.error("Помилка при виконанні INSERT-запиту до бази даних:", err.message);
                        res.status(500).send('Помилка сервера');
                    } else {
                        console.log("Альбом успішно доданий до бази даних");
                        res.status(201).send('Альбом успішно доданий');
                    }
                });
        } else {
            res.status(400).send('Неправильний запит');
        }
    });

app.listen(port, () => {
    console.log(`Сервер запущений на порту ${port}`);
});
