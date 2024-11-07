const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');

const app = express();
const port = 3002;

const db = new sqlite3.Database('./database.db');

// Create the albums table if it doesn't exist
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS albums (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        artist TEXT,
        album TEXT,
        cover TEXT,
        country TEXT,
        youtube_link TEXT,
        year INTEGER,
        listened INTEGER DEFAULT 0,
        description TEXT,
        songs TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) {
            console.error("Error creating albums table:", err.message);
        } else {
            console.log("Albums table checked or created");
        }
    });

    // Check for existing columns
    db.all("PRAGMA table_info(albums)", (err, columns) => {
        if (err) {
            console.error("Error checking table:", err.message);
        } else {
            const hasDescriptionColumn = columns.some(column => column.name === 'description');
            const hasSongsColumn = columns.some(column => column.name === 'songs');

            if (!hasDescriptionColumn) {
                db.run("ALTER TABLE albums ADD COLUMN description TEXT", (err) => {
                    if (err) {
                        console.error("Error adding description column:", err.message);
                    } else {
                        console.log("Description column added to albums table");
                    }
                });
            }

            if (!hasSongsColumn) {
                db.run("ALTER TABLE albums ADD COLUMN songs TEXT", (err) => {
                    if (err) {
                        console.error("Error adding songs column:", err.message);
                    } else {
                        console.log("Songs column added to albums table");
                    }
                });
            }
        }
    });
});

// Middleware setup
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

const secretKey = "1111"; // Authorization secret key

// Authorization middleware
const checkAuthorization = (req, res, next) => {
    const { authorization } = req.headers;
    if (authorization && authorization === secretKey) {
        next();
    } else {
        res.status(401).send('Unauthorized');
    }
};

// CORS configuration
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Respond to preflight requests
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Static files for uploads
app.use('/uploads', express.static(uploadDir));

// Login route
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    if (!password) {
        res.status(400).send('Password not provided');
    } else if (password === secretKey) {
        res.status(200).send('Login successful');
    } else {
        res.status(401).send('Incorrect password');
    }
});

// Delete album route
app.delete('/api/albums/:id', checkAuthorization, (req, res) => {
    const { id } = req.params;

    db.run("DELETE FROM albums WHERE id = ?", id, (err) => {
        if (err) {
            console.error("Error deleting album from database:", err.message);
            res.status(500).send('Server error');
        } else {
            console.log("Album successfully deleted from database");
            res.status(200).send('Album successfully deleted');
        }
    });
});

// Update album route
app.put('/api/albums/:id', checkAuthorization, (req, res) => {
    const albumId = req.params.id;
    const { artist, album, country, year, description, songs, listened, youtube_link } = req.body;

    const sql = `UPDATE albums
        SET artist = ?, album = ?, country = ?, year = ?, description = ?, songs = ?, listened = ?, youtube_link = ?
        WHERE id = ?`;

    db.run(
        sql,
        [
            artist,
            album,
            country,
            year,
            description,
            JSON.stringify(songs),
            listened,
            youtube_link || '',
            albumId
        ],
        (err) => {
            if (err) {
                console.error("Error updating album:", err.message);
                res.status(500).send('Server error');
            } else {
                console.log("Album successfully updated");
                res.status(200).send('Album successfully updated');
            }
        }
    );
});

// Check login status
app.get('/api/check-login', checkAuthorization, (req, res) => {
    res.status(200).send('User is authorized');
});

// Get specific album details
app.get('/api/albums/:id', (req, res) => {
    const { id } = req.params;

    db.get("SELECT * FROM albums WHERE id = ?", id, (err, row) => {
        if (err) {
            console.error("Error retrieving album data:", err.message);
            res.status(500).send('Server error');
        } else {
            if (!row) {
                res.status(404).send('Album not found');
            } else {
                row.songs = JSON.parse(row.songs || '[]');
                console.log("Album details:", row);
                res.json(row);
            }
        }
    });
});

// Routes for getting, filtering, and adding albums
app.route('/api/albums')
    .get((req, res) => {
        const { type, searchArtist, searchAlbum, searchCountry, searchYear } = req.query;
        let sql = type === 'listened'
            ? `SELECT * FROM albums WHERE listened = 1`
            : type === 'to-listen'
                ? `SELECT * FROM albums WHERE listened = 2`
                : `SELECT * FROM albums`;

        if (searchArtist) sql += ` AND artist LIKE '%${searchArtist}%'`;
        if (searchAlbum) sql += ` AND album LIKE '%${searchAlbum}%'`;
        if (searchCountry) sql += ` AND country LIKE '%${searchCountry}%'`;
        if (searchYear) sql += ` AND year = ${searchYear}`;

        sql += ` ORDER BY id DESC`;

        db.all(sql, (err, rows) => {
            if (err) {
                console.error(err.message);
                res.status(500).send('Server error');
            } else {
                rows.forEach(row => row.songs = JSON.parse(row.songs || '[]'));
                res.json(rows);
            }
        });
    })
    .post(checkAuthorization, upload.single('cover'), (req, res) => {
        const { artist, album, country, year, listened, description, songs, youtube_link } = req.body;
        const cover = req.file ? `http://localhost:3002/uploads/${req.file.filename}` : '';

        db.run(
            `INSERT INTO albums (artist, album, cover, country, year, description, songs, listened, youtube_link)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                artist,
                album,
                cover,
                country,
                year,
                description,
                JSON.stringify(songs),
                listened || 1,
                youtube_link || ''  // Вставка youtube_link у базу даних
            ],
            (err) => {
                if (err) {
                    console.error("Error adding album:", err.message);
                    res.status(500).send('Server error');
                } else {
                    res.status(201).send('Album successfully added');
                }
            }
        );
    });


// Move album to "to listen" status
app.put('/api/move-to-to-listen/:id', checkAuthorization, (req, res) => {
    const albumId = req.params.id;

    db.run(`UPDATE albums SET listened = 2 WHERE id = ?`, albumId, (err) => {
        if (err) {
            console.error("Error moving album to 'to listen':", err.message);
            res.status(500).send('Server error');
        } else {
            console.log("Album moved to 'to listen'");
            res.status(200).send('Album moved to "to listen"');
        }
    });
});

// Move album to "listened" status
app.put('/api/move-to-listened/:id', checkAuthorization, (req, res) => {
    const albumId = req.params.id;

    db.run(`UPDATE albums SET listened = 1 WHERE id = ?`, albumId, (err) => {
        if (err) {
            console.error("Error moving album to 'listened':", err.message);
            res.status(500).send('Server error');
        } else {
            console.log("Album moved to 'listened'");
            res.status(200).send('Album moved to "listened"');
        }
    });
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
