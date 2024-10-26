const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');

const app = express();
const port = 3001;

const db = new sqlite3.Database('./database.db');

// Створення таблиці альбомів, якщо вона не існує
db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS albums (id INTEGER PRIMARY KEY AUTOINCREMENT, artist TEXT, album TEXT, cover TEXT, country TEXT, youtube_link TEXT, year INTEGER, listened INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
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

// Перевірка прав доступу за допомогою секретного ключа
const checkAuthorization = (req, res, next) => {
    const { authorization } = req.headers;
    if (authorization && authorization === secretKey) {
        next();
    } else {
        res.status(401).send('Не авторизований');
    }
};

// Налаштування CORS для дозволу запитів із клієнтської частини
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    next();
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Маршрут для входу
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

// Видалення альбому
app.delete('/api/albums/:id', checkAuthorization, (req, res) => {
    const { id } = req.params;

    db.run("DELETE FROM albums WHERE id = ?", id, (err) => {
        if (err) {
            console.error("Помилка при видаленні альбому з бази даних:", err.message);
            res.status(500).send('Помилка сервера');
        } else {
            console.log("Альбом успішно видалений з бази даних");
            res.status(200).send('Альбом успішно видалений');
        }
    });
});

// Оновлення статусу альбому (прослуханий/треба послухати)
app.put('/api/albums/:id', checkAuthorization, (req, res) => {
    const albumId = req.params.id;
    const { listened } = req.body;

    db.run("UPDATE albums SET listened = ? WHERE id = ?", [listened, albumId], (err) => {
        if (err) {
            console.error("Помилка при оновленні альбому:", err.message);
            res.status(500).send('Помилка сервера');
        } else {
            console.log("Альбом успішно оновлений");
            res.status(200).send('Альбом успішно оновлений');
        }
    });
});

// Перевірка авторизації користувача
app.get('/api/check-login', checkAuthorization, (req, res) => {
    res.status(200).send('Користувач авторизований');
});

// Отримання деталей конкретного альбому
app.get('/api/albums/:id', (req, res) => {
    const { id } = req.params;

    db.get("SELECT * FROM albums WHERE id = ?", id, (err, row) => {
        if (err) {
            console.error("Помилка отримання даних альбому:", err.message);
            res.status(500).send('Помилка сервера');
        } else {
            if (!row) {
                res.status(404).send('Альбом не знайдено');
            } else {
                console.log("Деталі альбому:", row);
                res.json(row);
            }
        }
    });
});
// Маршрут для переміщення альбому з "треба послухати" в "прослухане"
app.put('/api/move-to-listened/:id', checkAuthorization, (req, res) => {
    const albumId = req.params.id;

    db.run("UPDATE albums SET listened = 1 WHERE id = ? AND listened = 2", albumId, (err) => {
        if (err) {
            console.error("Помилка при переміщенні альбому в 'прослухане':", err.message);
            res.status(500).send('Помилка сервера');
        } else {
            console.log("Альбом успішно переміщений в 'прослухане'");
            res.status(200).send('Альбом успішно переміщений в "прослухане"');
        }
    });
});
// Маршрут для переміщення альбому з "прослухане" в "те, що треба прослухати"
app.put('/api/move-to-to-listen/:id', checkAuthorization, (req, res) => {
    const albumId = req.params.id;

    db.run("UPDATE albums SET listened = 2 WHERE id = ? AND listened = 1", albumId, (err) => {
        if (err) {
            console.error("Помилка при переміщенні альбому в 'те, що треба прослухати':", err.message);
            res.status(500).send('Помилка сервера');
        } else {
            console.log("Альбом успішно переміщений в 'те, що треба прослухати'");
            res.status(200).send('Альбом успішно переміщений в "те, що треба прослухати"');
        }
    });
});

// Маршрути для отримання, фільтрації та додавання альбомів
app.route('/api/albums')
    .get((req, res) => {
        const { type, sort, searchArtist, searchAlbum, searchCountry, searchYear } = req.query;
        let sql = type === 'listened'
            ? `SELECT * FROM albums WHERE listened = 1`
            : type === 'to-listen'
                ? `SELECT * FROM albums WHERE listened = 2`
                : null;

        if (!sql) {
            res.status(400).send('Неправильний запит');
            return;
        }

        if (searchArtist) sql += ` AND artist LIKE '%${searchArtist}%'`;
        if (searchAlbum) sql += ` AND album LIKE '%${searchAlbum}%'`;
        if (searchCountry) sql += ` AND country LIKE '%${searchCountry}%'`;
        if (searchYear) sql += ` AND year = ${searchYear}`;

        sql += ` ORDER BY id DESC`;

        db.all(sql, (err, rows) => {
            if (err) {
                console.error(err.message);
                res.status(500).send('Помилка сервера');
            } else {
                res.json(rows);
            }
        });
    })
    .post(checkAuthorization, upload.single('cover'), (req, res) => {
        const { action, listened, artist, album, country, youtube_link, year } = req.body;
        const listenedValue = listened || 1;
        const cover = req.file ? `http://localhost:3001/uploads/${req.file.filename}` : '';

        if (action === 'add') {
            db.run("INSERT INTO albums (artist, album, cover, country, youtube_link, year, listened) VALUES (?, ?, ?, ?, ?, ?, ?)",
                [artist, album, cover, country, youtube_link, year, listenedValue],
                (err) => {
                    if (err) {
                        console.error("Помилка при виконанні INSERT-запиту до бази даних:", err.message);
                        res.status(500).send('Помилка сервера');
                    } else {
                        res.status(201).send('Альбом успішно доданий');
                    }
                });
        } else {
            res.status(400).send('Неправильний запит');
        }
    });

// Запуск сервера
app.listen(port, () => {
    console.log(`Сервер запущений на порту ${port}`);
});
