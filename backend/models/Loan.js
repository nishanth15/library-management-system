
const mongoose = require("mongoose");

const loanSchema = new mongoose.Schema(
    {
        book: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Book",
            required: true
        },
        studentName: {
            type: String,
            required: true,
            trim: true,
            maxlength: 150
        },
        studentId: {
            type: String,
            required: true,
            trim: true,
            maxlength: 50
        },
        issueDate: {
            type: Date,
            required: true,
            default: Date.now
        },
        dueDate: {
            type: Date,
            required: true
        },
        returnDate: {
            type: Date,
            default: null
        },
        status: {
            type: String,
            enum: ["Issued", "Returned"],
            default: "Issued",
            required: true
        }
    },
    { timestamps: true }
);

loanSchema.index({ studentId: 1, status: 1 });
loanSchema.index({ book: 1, status: 1 });

module.exports = mongoose.model("Loan", loanSchema);
