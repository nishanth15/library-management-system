
const mongoose = require("mongoose");
const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongoServer;
let app;

jest.setTimeout(90000);

beforeAll(async () => {
    // Start a dedicated temporary MongoDB instance.
    mongoServer = await MongoMemoryServer.create({
        binary: {
            version: "7.0.14"
        },
        instance: {
            launchTimeout: 30000
        }
    });

    // Point the tests to the temporary database, not Atlas.
    process.env.MONGODB_URI = mongoServer.getUri();

    // Load the Express app without starting a separate server.
    app = require("../server");

    // Connect Mongoose to the temporary database.
    await mongoose.connect(process.env.MONGODB_URI);
}, 90000);

afterEach(async () => {
    // Clear test records only.
    for (const collection of Object.values(mongoose.connection.collections)) {
        await collection.deleteMany({});
    }
});

afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }

    if (mongoServer) {
        await mongoServer.stop();
    }
});

describe("Library Management System API", () => {
    const book = {
        title: "Test Algorithms",
        author: "Test Author",
        isbn: "TEST-ISBN-001",
        category: "Computer Science",
        quantity: 5
    };

    test("GET / responds successfully", async () => {
        const response = await request(app).get("/");

        expect(response.status).toBe(200);
        expect(response.text).toContain("Backend is Running");
    });

    test("POST /api/books creates a book", async () => {
        const response = await request(app)
            .post("/api/books")
            .send(book);

        expect(response.status).toBe(201);
        expect(response.body.book.title).toBe(book.title);
        expect(response.body.book.quantity).toBe(5);
        expect(response.body.book._id).toBeDefined();
    });

    test("POST /api/books rejects missing required fields", async () => {
        const response = await request(app)
            .post("/api/books")
            .send({ title: "Incomplete Book" });

        expect(response.status).toBe(400);
        expect(response.body.message).toBeDefined();
    });

    test("POST /api/books rejects a duplicate ISBN", async () => {
        await request(app)
            .post("/api/books")
            .send(book);

        const response = await request(app)
            .post("/api/books")
            .send({ ...book, title: "Another Test Book" });

        expect(response.status).toBe(409);
        expect(response.body.message).toContain("ISBN");
    });

    test("GET /api/books lists saved books", async () => {
        await request(app)
            .post("/api/books")
            .send(book);

        const response = await request(app).get("/api/books");

        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(1);
        expect(response.body[0].isbn).toBe(book.isbn);
    });

    test("GET /api/books/:id rejects an invalid ID", async () => {
        const response = await request(app)
            .get("/api/books/not-a-valid-id");

        expect(response.status).toBe(400);
        expect(response.body.message).toContain("Invalid book ID");
    });

    test("PUT /api/books/:id updates a book", async () => {
        const created = await request(app)
            .post("/api/books")
            .send(book);

        const response = await request(app)
            .put(`/api/books/${created.body.book._id}`)
            .send({ category: "Algorithms" });

        expect(response.status).toBe(200);
        expect(response.body.book.category).toBe("Algorithms");
    });

    test("DELETE /api/books/:id deletes a book", async () => {
        const created = await request(app)
            .post("/api/books")
            .send(book);

        const response = await request(app)
            .delete(`/api/books/${created.body.book._id}`);

        expect(response.status).toBe(200);

        const list = await request(app).get("/api/books");
        expect(list.body).toHaveLength(0);
    });
});
