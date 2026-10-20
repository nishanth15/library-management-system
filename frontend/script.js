
const API_URL = "http://localhost:5000/api";
const $ = id => document.getElementById(id);

let books = [];
let loans = [];
let isLoadingBooks = false;
let isLoadingLoans = false;

function showMessage(id, text, isError = false) {
    const element = $(id);
    element.textContent = text;
    element.classList.toggle("error", isError);
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? "—"
        : date.toLocaleDateString("en-IN");
}

async function apiRequest(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...options.headers
        }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.message || `Request failed (${response.status})`);
    }

    return data;
}

// ==================== BOOKS ====================

function updateStatistics() {
    $("totalBooks").textContent = books.length;

    // The API quantity represents copies currently available.
    // Add active loans back to calculate the total owned copies.
    const issuedCopies = loans.filter(loan => loan.status === "Issued").length;
    const availableCopies = books.reduce(
        (sum, book) => sum + Number(book.quantity || 0), 0
    );

    $("totalCopies").textContent = availableCopies + issuedCopies;
    $("availableCopies").textContent = availableCopies;
}

function renderBooks() {
    const query = $("searchInput").value.trim().toLowerCase();

    const filtered = books.filter(book =>
        [book.title, book.author, book.isbn, book.category]
            .some(value => String(value || "").toLowerCase().includes(query))
    );

    if (!filtered.length) {
        $("bookTableBody").innerHTML = `
            <tr><td colspan="6" class="empty-state">
                ${query ? "No matching books found." : "No books yet. Add your first book!"}
            </td></tr>`;
        updateStatistics();
        return;
    }

    $("bookTableBody").innerHTML = filtered.map(book => {
        const available = Number(book.quantity || 0);

        return `
            <tr>
                <td>
                    <div class="book-title">${escapeHTML(book.title)}</div>
                    <div class="book-author">${escapeHTML(book.author)}</div>
                </td>
                <td>${escapeHTML(book.isbn)}</td>
                <td>${escapeHTML(book.category)}</td>
                <td>${available}</td>
                <td>
                    <span class="pill ${available ? "" : "unavailable"}">
                        ${available ? "Available" : "Out of stock"}
                    </span>
                </td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-small btn-edit" data-action="edit"
                            data-id="${escapeHTML(book._id)}" type="button">Edit</button>
                        <button class="btn-small btn-delete" data-action="delete"
                            data-id="${escapeHTML(book._id)}" type="button">Delete</button>
                    </div>
                </td>
            </tr>`;
    }).join("");

    updateStatistics();
}

function renderBookOptions() {
    const select = $("loanBookId");
    const previousValue = select.value;

    const availableBooks = books.filter(book => Number(book.quantity) > 0);

    select.innerHTML = '<option value="">Select an available book</option>' +
        availableBooks.map(book => `
            <option value="${escapeHTML(book._id)}">
                ${escapeHTML(book.title)} — ${Number(book.quantity)} available
            </option>
        `).join("");

    if (availableBooks.some(book => book._id === previousValue)) {
        select.value = previousValue;
    }

    if (!availableBooks.length) {
        select.innerHTML = '<option value="">No books currently available</option>';
    }
}

async function loadBooks() {
    if (isLoadingBooks) return;
    isLoadingBooks = true;

    try {
        books = await apiRequest("/books");
        renderBooks();
        renderBookOptions();
        showMessage("message", `Catalogue loaded: ${books.length} title(s).`);
    } catch (error) {
        console.error(error);
        showMessage("message", error.message, true);
        $("bookTableBody").innerHTML = `
            <tr><td colspan="6" class="empty-state">Could not load books.</td></tr>`;
    } finally {
        isLoadingBooks = false;
    }
}

function openAddForm() {
    $("bookForm").reset();
    $("bookId").value = "";
    $("quantity").value = "1";
    $("formTitle").textContent = "Add a new book";
    $("saveBtn").textContent = "Save book";
    $("bookForm").classList.remove("hidden");
    $("title").focus();
}

function openEditForm(id) {
    const book = books.find(item => item._id === id);

    if (!book) {
        showMessage("message", "Book not found. Refresh the catalogue.", true);
        return;
    }

    $("bookForm").reset();
    $("bookId").value = book._id;
    $("title").value = book.title;
    $("author").value = book.author;
    $("isbn").value = book.isbn;
    $("category").value = book.category;
    $("quantity").value = book.quantity;
    $("formTitle").textContent = "Edit book details";
    $("saveBtn").textContent = "Update book";
    $("bookForm").classList.remove("hidden");
    $("bookForm").scrollIntoView({ behavior: "smooth", block: "center" });
}

async function saveBook(event) {
    event.preventDefault();

    if (!$("bookForm").reportValidity()) return;

    const form = new FormData($("bookForm"));
    const quantity = Number(form.get("quantity"));

    if (!Number.isInteger(quantity) || quantity < 0) {
        showMessage("message", "Quantity must be a whole number of zero or more.", true);
        return;
    }

    const book = {
        title: form.get("title").trim(),
        author: form.get("author").trim(),
        isbn: form.get("isbn").trim(),
        category: form.get("category").trim(),
        quantity
    };

    const id = $("bookId").value;
    const editing = Boolean(id);
    const button = $("saveBtn");
    button.disabled = true;

    try {
        await apiRequest(editing ? `/books/${encodeURIComponent(id)}` : "/books", {
            method: editing ? "PUT" : "POST",
            body: JSON.stringify(book)
        });

        $("bookForm").reset();
        $("bookId").value = "";
        $("bookForm").classList.add("hidden");

        await loadBooks();
        showMessage("message", editing ? "Book updated successfully!" : "Book added successfully!");
    } catch (error) {
        showMessage("message", error.message, true);
    } finally {
        button.disabled = false;
        button.textContent = $("bookId").value ? "Update book" : "Save book";
    }
}

async function deleteBook(id) {
    const book = books.find(item => item._id === id);
    if (!book) return;

    if (!confirm(`Delete "${book.title}"? This cannot be undone.`)) return;

    try {
        await apiRequest(`/books/${encodeURIComponent(id)}`, { method: "DELETE" });
        await loadBooks();
        await loadLoans();
        showMessage("message", "Book deleted successfully!");
    } catch (error) {
        showMessage("message", error.message, true);
    }
}

// ==================== LOAN HISTORY ====================

function renderLoans() {
    const query = $("loanSearchInput").value.trim().toLowerCase();
    const statusFilter = $("loanStatusFilter").value;

    const filtered = loans.filter(loan => {
        const bookTitle = loan.book?.title || "Book record unavailable";
        const searchText = [
            bookTitle, loan.studentName, loan.studentId
        ].join(" ").toLowerCase();

        const statusMatches =
            statusFilter === "All" ||
            (statusFilter === "Overdue"
                ? loan.displayStatus === "Overdue"
                : loan.status === statusFilter);

        return searchText.includes(query) && statusMatches;
    });

    if (!filtered.length) {
        $("loanTableBody").innerHTML = `
            <tr><td colspan="7" class="empty-state">No matching loan records.</td></tr>`;
        return;
    }

    $("loanTableBody").innerHTML = filtered.map(loan => {
        const status = loan.displayStatus || loan.status;
        const active = loan.status === "Issued";

        return `
            <tr>
                <td>
                    <div class="book-title">${escapeHTML(loan.book?.title || "Book record unavailable")}</div>
                    <div class="book-author">${escapeHTML(loan.book?.author || "")}</div>
                </td>
                <td>${escapeHTML(loan.studentName)}</td>
                <td>${escapeHTML(loan.studentId)}</td>
                <td>${formatDate(loan.issueDate)}</td>
                <td>${formatDate(loan.dueDate)}</td>
                <td>
                    <span class="pill ${status === "Overdue" ? "unavailable" : ""}">
                        ${escapeHTML(status)}
                    </span>
                    ${loan.returnDate ? `<div class="book-author">Returned: ${formatDate(loan.returnDate)}</div>` : ""}
                </td>
                <td>
                    ${active
                        ? `<button class="btn-small btn-edit" data-action="return"
                              data-id="${escapeHTML(loan._id)}" type="button">Return</button>`
                        : "—"}
                </td>
            </tr>`;
    }).join("");
}

async function loadLoans() {
    if (isLoadingLoans) return;
    isLoadingLoans = true;

    try {
        loans = await apiRequest("/loans");
        renderLoans();
        updateStatistics();
    } catch (error) {
        console.error(error);
        showMessage("loanMessage", error.message, true);
        $("loanTableBody").innerHTML = `
            <tr><td colspan="7" class="empty-state">Could not load loan history.</td></tr>`;
    } finally {
        isLoadingLoans = false;
    }
}

// ==================== ISSUE AND RETURN ====================

async function issueBook(event) {
    event.preventDefault();

    if (!$("loanForm").reportValidity()) return;

    const payload = {
        bookId: $("loanBookId").value,
        studentName: $("studentName").value.trim(),
        studentId: $("studentId").value.trim(),
        dueDate: $("dueDate").value
    };

    if (!payload.bookId) {
        showMessage("loanMessage", "Please select an available book.", true);
        return;
    }

    const button = $("issueBtn");
    button.disabled = true;
    button.textContent = "Issuing...";

    try {
        await apiRequest("/loans", {
            method: "POST",
            body: JSON.stringify(payload)
        });

        $("loanForm").reset();
        showMessage("loanMessage", "Book issued successfully!");

        await Promise.all([loadBooks(), loadLoans()]);
    } catch (error) {
        showMessage("loanMessage", error.message, true);
    } finally {
        button.disabled = false;
        button.textContent = "Issue book";
    }
}

async function returnBook(id) {
    const loan = loans.find(item => item._id === id);
    if (!loan || loan.status !== "Issued") return;

    if (!confirm(`Record the return of "${loan.book?.title || "this book"}" from ${loan.studentName}?`)) {
        return;
    }

    try {
        await apiRequest(`/loans/${encodeURIComponent(id)}/return`, {
            method: "PATCH"
        });

        showMessage("loanMessage", "Book returned successfully!");
        await Promise.all([loadBooks(), loadLoans()]);
    } catch (error) {
        showMessage("loanMessage", error.message, true);
    }
}

// ==================== EVENT HANDLERS ====================

$("showFormBtn").addEventListener("click", openAddForm);

$("cancelBtn").addEventListener("click", () => {
    $("bookForm").reset();
    $("bookId").value = "";
    $("bookForm").classList.add("hidden");
    showMessage("message", "");
});

$("bookForm").addEventListener("submit", saveBook);
$("searchInput").addEventListener("input", renderBooks);
$("refreshBtn").addEventListener("click", async () => {
    await Promise.all([loadBooks(), loadLoans()]);
});

$("bookTableBody").addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    if (button.dataset.action === "edit") {
        openEditForm(button.dataset.id);
    } else if (button.dataset.action === "delete") {
        deleteBook(button.dataset.id);
    }
});

$("loanForm").addEventListener("submit", issueBook);
$("refreshLoansBtn").addEventListener("click", loadLoans);
$("loanSearchInput").addEventListener("input", renderLoans);
$("loanStatusFilter").addEventListener("change", renderLoans);

$("loanTableBody").addEventListener("click", event => {
    const button = event.target.closest('button[data-action="return"]');
    if (button) returnBook(button.dataset.id);
});

// The due date defaults to seven days from today.
const defaultDueDate = new Date();
defaultDueDate.setDate(defaultDueDate.getDate() + 7);
$("dueDate").value = [
    defaultDueDate.getFullYear(),
    String(defaultDueDate.getMonth() + 1).padStart(2, "0"),
    String(defaultDueDate.getDate()).padStart(2, "0")
].join("-");
$("dueDate").min = new Date().toLocaleDateString("en-CA");

async function initialiseDashboard() {
    await loadBooks();
    await loadLoans();
}

initialiseDashboard();
