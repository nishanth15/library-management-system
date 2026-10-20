
require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const Book = require("./models/Book");
const Loan = require("./models/Loan");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Validate MongoDB document IDs
function validId(id) {
    return mongoose.isValidObjectId(id);
}

// Dashboard
app.get("/", (req, res) => {
    res.send("Library Management System Backend is Running!");
});

// ==================== BOOK APIs ====================

// Add a book
app.post("/api/books", async (req, res) => {
    try {
        const { title, author, isbn, category, quantity } = req.body;

        if (
            typeof title !== "string" || !title.trim() ||
            typeof author !== "string" || !author.trim() ||
            typeof isbn !== "string" || !isbn.trim() ||
            typeof category !== "string" || !category.trim()
        ) {
            return res.status(400).json({
                message: "Title, author, ISBN and category are required."
            });
        }

        const book = await Book.create({
            title,
            author,
            isbn,
            category,
            quantity
        });

        res.status(201).json({
            message: "Book added successfully!",
            book
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                message: "This ISBN already exists."
            });
        }

        if (error.name === "ValidationError" || error.name === "CastError") {
            return res.status(400).json({ message: error.message });
        }

        console.error("Add book error:", error.message);
        res.status(500).json({ message: "Failed to add book." });
    }
});

// Get all books
app.get("/api/books", async (req, res) => {
    try {
        const books = await Book.find().sort({ title: 1 });
        res.json(books);
    } catch (error) {
        console.error("Get books error:", error.message);
        res.status(500).json({ message: "Failed to retrieve books." });
    }
});

// Get one book
app.get("/api/books/:id", async (req, res) => {
    try {
        if (!validId(req.params.id)) {
            return res.status(400).json({ message: "Invalid book ID." });
        }

        const book = await Book.findById(req.params.id);

        if (!book) {
            return res.status(404).json({ message: "Book not found." });
        }

        res.json(book);
    } catch (error) {
        console.error("Get book error:", error.message);
        res.status(500).json({ message: "Failed to retrieve book." });
    }
});

// Update a book
app.put("/api/books/:id", async (req, res) => {
    try {
        if (!validId(req.params.id)) {
            return res.status(400).json({ message: "Invalid book ID." });
        }

        const book = await Book.findById(req.params.id);

        if (!book) {
            return res.status(404).json({ message: "Book not found." });
        }

        // Do not allow reducing quantity below copies currently on loan.
        if (req.body.quantity !== undefined) {
            const activeLoans = await Loan.countDocuments({
                book: book._id,
                status: "Issued"
            });

            if (
                !Number.isInteger(req.body.quantity) ||
                req.body.quantity < activeLoans
            ) {
                return res.status(400).json({
                    message: `Quantity cannot be less than ${activeLoans} currently issued copies.`
                });
            }
        }

        const allowedFields = ["title", "author", "isbn", "category", "quantity"];
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                book.set(field, req.body[field]);
            }
        }

        await book.save();

        res.json({
            message: "Book updated successfully!",
            book
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                message: "This ISBN already exists."
            });
        }

        if (error.name === "ValidationError" || error.name === "CastError") {
            return res.status(400).json({ message: error.message });
        }

        console.error("Update book error:", error.message);
        res.status(500).json({ message: "Failed to update book." });
    }
});

// Delete a book only if it has no active loans
app.delete("/api/books/:id", async (req, res) => {
    try {
        if (!validId(req.params.id)) {
            return res.status(400).json({ message: "Invalid book ID." });
        }

        const activeLoans = await Loan.countDocuments({
            book: req.params.id,
            status: "Issued"
        });

        if (activeLoans > 0) {
            return res.status(409).json({
                message: "This book has active loans. Return those copies before deleting it."
            });
        }

        const book = await Book.findByIdAndDelete(req.params.id);

        if (!book) {
            return res.status(404).json({ message: "Book not found." });
        }

        res.json({ message: "Book deleted successfully!" });
    } catch (error) {
        console.error("Delete book error:", error.message);
        res.status(500).json({ message: "Failed to delete book." });
    }
});

// ==================== LOAN APIs ====================

// Issue a book
app.post("/api/loans", async (req, res) => {
    try {
        const { bookId, studentName, studentId, dueDate } = req.body;

        if (
            !validId(bookId) ||
            typeof studentName !== "string" || !studentName.trim() ||
            typeof studentId !== "string" || !studentId.trim() ||
            !dueDate
        ) {
            return res.status(400).json({
                message: "Valid book, student name, student ID and due date are required."
            });
        }

        const due = new Date(dueDate);

        if (Number.isNaN(due.getTime())) {
            return res.status(400).json({ message: "Invalid due date." });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (due < today) {
            return res.status(400).json({
                message: "Due date cannot be in the past."
            });
        }

        // Atomically reserve a copy so concurrent requests cannot
        // issue more copies than the stored quantity.
        const book = await Book.findOneAndUpdate(
            { _id: bookId, quantity: { $gt: 0 } },
            { $inc: { quantity: -1 } },
            { new: true }
        );

        if (!book) {
            const exists = await Book.exists({ _id: bookId });

            return res.status(exists ? 409 : 404).json({
                message: exists
                    ? "No copies are available for this book."
                    : "Book not found."
            });
        }

        try {
            const loan = await Loan.create({
                book: book._id,
                studentName: studentName.trim(),
                studentId: studentId.trim(),
                dueDate: due
            });

            const populatedLoan = await Loan.findById(loan._id)
                .populate("book", "title author isbn");

            res.status(201).json({
                message: "Book issued successfully!",
                loan: populatedLoan
            });
        } catch (error) {
            // Restore the reserved copy if creating the loan fails.
            await Book.updateOne(
                { _id: book._id },
                { $inc: { quantity: 1 } }
            );

            throw error;
        }
    } catch (error) {
        if (error.name === "ValidationError" || error.name === "CastError") {
            return res.status(400).json({ message: error.message });
        }

        console.error("Issue book error:", error.message);
        res.status(500).json({ message: "Failed to issue book." });
    }
});

// Get loan history, including overdue status
app.get("/api/loans", async (req, res) => {
    try {
        const loans = await Loan.find()
            .populate("book", "title author isbn")
            .sort({ createdAt: -1 })
            .lean();

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const results = loans.map(loan => {
            const overdue =
                loan.status === "Issued" &&
                new Date(loan.dueDate) < today;

            return {
                ...loan,
                overdue,
                displayStatus: overdue ? "Overdue" : loan.status
            };
        });

        res.json(results);
    } catch (error) {
        console.error("Get loans error:", error.message);
        res.status(500).json({ message: "Failed to retrieve loan history." });
    }
});

// Return an issued book
app.patch("/api/loans/:id/return", async (req, res) => {
    const session = await mongoose.startSession();

    try {
        if (!validId(req.params.id)) {
            return res.status(400).json({ message: "Invalid loan ID." });
        }

        let returnedLoan;

        await session.withTransaction(async () => {
            const loan = await Loan.findOne({
                _id: req.params.id,
                status: "Issued"
            }).session(session);

            if (!loan) {
                const existing = await Loan.findById(req.params.id)
                    .session(session);

                const error = new Error(
                    existing ? "This book has already been returned." : "Loan not found."
                );
                error.status = existing ? 409 : 404;
                throw error;
            }

            const book = await Book.findById(loan.book).session(session);

            if (!book) {
                const error = new Error("The associated book record was not found.");
                error.status = 404;
                throw error;
            }

            loan.status = "Returned";
            loan.returnDate = new Date();

            // Update both records in the same transaction.
            book.quantity += 1;

            await book.save({ session });
            await loan.save({ session });

            returnedLoan = loan;
        });

        const populatedLoan = await Loan.findById(returnedLoan._id)
            .populate("book", "title author isbn");

        res.json({
            message: "Book returned successfully!",
            loan: populatedLoan
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ message: error.message });
        }

        console.error("Return book error:", error.message);
        res.status(500).json({
            message: "Could not return the book. Check that your MongoDB cluster supports transactions."
        });
    } finally {
        await session.endSession();
    }
});

// Start server
async function startServer() {
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error("MONGODB_URI is missing from .env");
        }

        await mongoose.connect(process.env.MONGODB_URI);
        console.log("MongoDB connected successfully!");

        app.listen(PORT, () => {
            console.log(`Server running at http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("Backend startup failed:", error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    startServer();
}

module.exports = app;
