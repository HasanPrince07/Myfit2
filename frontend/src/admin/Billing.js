import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import * as XLSX from 'xlsx';
import DeleteModal from "../common/DeleteModal";
import "./Admin.css";

// billing table me transactions name ki sub-table honi chahiye jo kisi specific bill ki history btaye
// pdf me gym name, gym address etc. add karna he
// api call ka name a_b_c krna he
// plan select na hone par bhi expiry date aa rahi he
// generate_invoice_status column add krna he
// payment method column add krna he
// modal me plan expiry date show nhi ho rhi
// collect payment ka icon add krna he
// total earning, total due, total invoice generated ka data shw krna he

const INITIAL_STATE = { invoice_no: "", total_amount: 0, pay_amount: 0, remaining_amount: 0, payment_status: "", created_at: "", member_id: "", member_name: "", member_phone: "", plan_expiry_date: "", plan_name: "" }
const INITIAL_FILTERS = { search: "", payment: "", plan: "", startDate: "", endDate: "" }

const FILTER_FIELDS = {
    payment: [
        { value: "complete", label: "Complete" },
        { value: "partial", label: "Partial" },
        { value: "due", label: "Due" }
    ]
};

function Billing() {

    const [billing, setBilling] = useState(INITIAL_STATE);
    const [filter, setFilter] = useState(INITIAL_FILTERS);

    const [data, setData] = useState([]);
    const [plans, setPlans] = useState([]);

    const [modal, setModal] = useState({ modal: false, delete: false, pdf: false });
    const [loading, setLoading] = useState({ table: false, modal: false, delete: false, excel: false, pdf: false });
    const [selectedIds, setSelectedIds] = useState([]);

    const [currentPage, setCurrentPage] = useState(1);
    const [totalRows, setTotalRows] = useState(0);
    const itemsPerPage = 10;
    const totalPages = Math.ceil(totalRows / itemsPerPage);
    const startingSerialNumber = (currentPage - 1) * itemsPerPage;

    const searchTimeoutRef = useRef(null);

    const handleFetch = useCallback(async (currentFilters, page) => {
        setLoading(prev => ({ ...prev, table: true }));
        try {
            const limit = itemsPerPage;
            const offset = (page - 1) * itemsPerPage;
            const res = await fetch(`/admin/fetch-billings?limit=${limit}&offset=${offset}&search=${currentFilters.search}&payment=${currentFilters.payment}&plan=${currentFilters.plan}&startDate=${currentFilters.startDate}&endDate=${currentFilters.endDate}`, {
                method: "GET",
                credentials: "include",
            });
            const resData = await res.json();
            if (!res.ok) {
                setData([]);
                setTotalRows(0);
                toast(resData.message, { type: "error" });
                return;
            }
            setData(resData.data || []);
            setTotalRows(resData.totalRows || 0);
        } catch (error) {
            toast("Network error, please check your internet", { type: "error" });
            console.error("Error during fetch billings:", error);
        } finally {
            setLoading(prev => ({ ...prev, table: false }));
        }
    }, []);

    const fetchPlans = useCallback(async () => {
        try {
            const res = await fetch(`/admin/fetch-billing-plans`, {
                method: "GET",
                credentials: "include"
            });
            const resData = await res.json();
            if (!res.ok) {
                setPlans([]);
                toast(resData.message, { type: "error" });
                return;
            }
            setPlans(resData.data || []);
        } catch (error) {
            toast("Network error, please check your internet", { type: "error" });
            console.error("Error during fetch billing plans:", error);
        }
    }, []);

    useEffect(() => {
        handleFetch(filter, currentPage);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [handleFetch, currentPage]);

    useEffect(() => {
        fetchPlans();
    }, [fetchPlans]);

    const handleFilterChange = (e) => {
        const { name, value } = e.target;
        const updatedFilters = { ...filter, [name]: value };
        setFilter(updatedFilters);
        setCurrentPage(1);
        if (name === "search") {
            if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
            if (value.length > 0 && value.trim() === "") {
                return;
            }
            searchTimeoutRef.current = setTimeout(() => {
                const filtersToSend = { ...updatedFilters, search: value.trim() };
                handleFetch(filtersToSend, 1);
            }, 800);
        } else {
            if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
            handleFetch(updatedFilters, 1);
        }
    };

    const handleClearFilters = () => {
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        setFilter(INITIAL_FILTERS);
        setCurrentPage(1);
        handleFetch(INITIAL_FILTERS, 1);
    };

    const handleForm = async (e) => {
        e.preventDefault();
        setLoading(prev => ({ ...prev, pdf: true }));
        try {
            const cleanedBilling = {
                ...billing,
                invoice_no: String(billing.invoice_no || "").trim(),
                payment_status: String(billing.payment_status || "").trim(),
                created_at: String(billing.created_at || "").trim(),
                member_name: String(billing.member_name || "").trim(),
                member_phone: String(billing.member_phone || "").trim(),
                plan_expiry_date: String(billing.plan_expiry_date || "").trim(),
                plan_name: String(billing.plan_name || "").trim(),
                member_id: billing.member_id ? parseInt(billing.member_id, 10) : null,
                total_amount: parseFloat(billing.total_amount) || 0,
                pay_amount: parseFloat(billing.pay_amount) || 0,
                remaining_amount: parseFloat(billing.remaining_amount) || 0
            };
            const res = await fetch(`/admin/generate-pdf`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(cleanedBilling)
            });
            if (!res.ok) {
                const resData = await res.json();
                toast(resData.message, { type: "error" });
                return;
            }
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const safeMemberName = billing.member_name.trim().replace(/\s+/g, '_');
            a.download = `${safeMemberName}_invoice.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            setModal(prev => ({ ...prev, pdf: false }));
            toast("Invoice download successfully", { type: "success" });
        } catch (error) {
            toast("Network error, please check your internet", { type: "error" });
            console.error("Error during generate pdf:", error);
        } finally {
            setLoading(prev => ({ ...prev, pdf: false }));
        }
    }

    const fetchByID = useCallback(async (id) => {
        setLoading(prev => ({ ...prev, modal: true }));
        try {
            const res = await fetch(`/admin/fetch-billing-by-id/${id}`, {
                method: "GET",
                credentials: "include"
            });
            const resData = await res.json();
            if (!res.ok) {
                toast(resData.message, { type: "error" });
            }
            setBilling(resData.data);
        } catch (error) {
            toast("Network error, please check your internet", { type: "error" });
            console.error("Error during fetch billing by id:", error);
        } finally {
            setLoading(prev => ({ ...prev, modal: false }));
        }
    }, []);

    const handleDelete = async () => {
        if (selectedIds.length === 0) return;
        setLoading(prev => ({ ...prev, delete: true }));
        try {
            const res = await fetch("/admin/delete-billings", {
                method: "DELETE",
                credentials: "include",
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: selectedIds })
            });
            const resData = await res.json();
            if (!res.ok) {
                toast(resData.message, { type: "error" });
            }
            setSelectedIds([]);
            const isPageEmptyAfterDelete = data.length === selectedIds.length;
            const nextPage = (currentPage > 1 && isPageEmptyAfterDelete) ? currentPage - 1 : currentPage;
            if (nextPage !== currentPage) {
                setCurrentPage(nextPage);
            }
            handleFetch(filter, nextPage);
            fetchPlans();
            setModal(prev => ({ ...prev, delete: false }));
            toast(resData.message, { type: "success" });
        } catch (error) {
            toast("Network error, please check your internet", { type: "error" });
            console.error("Error during delete billings:", error);
        } finally {
            setLoading(prev => ({ ...prev, delete: false }));
        }
    }

    const handleExcel = async () => {
        try {
            setLoading(prev => ({ ...prev, excel: true }));
            const res = await fetch(`/admin/fetch-billings?limit=ALL&offset=0&search=${filter.search}&payment=${filter.payment}&plan=${filter.plan}&startDate=${filter.startDate}&endDate=${filter.endDate}`, {
                method: "GET",
                credentials: "include",
            });
            const resData = await res.json();
            if (!res.ok) {
                toast(resData.message, { type: "error" });
                return;
            }
            const excelRows = resData.data.map((billing, index) => ({
                "S.No.": index + 1,
                "Invoice No": billing.invoice_no,
                "Member ID": `FIT-${String(billing.member_id).padStart(3, '0')}`,
                "Member Name": billing.member_name,
                "Member Phone": billing.member_phone,
                "Plan Name": billing.plan_name || "No Plan",
                "Total Amount": billing.total_amount || 0,
                "Pay Amount": billing.pay_amount || 0,
                "Remaining Amount": billing.remaining_amount || 0,
                "Payment Status": billing.payment_status,
                "Expiry Date": formatDate(billing.plan_expiry_date) || "N/A",
                "Created At": formatDate(billing.created_at),
            }));
            const worksheet = XLSX.utils.json_to_sheet(excelRows);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Billings List");
            const fileName = `Billings_Report_${new Date().toISOString().split('T')[0]}.xlsx`;
            XLSX.writeFile(workbook, fileName);
            toast("Excel Sheet Downloaded!", { type: "success" });
        } catch (error) {
            toast("Network error, please check your internet", { type: "error" });
            console.error("Error during download excel sheet:", error);
        } finally {
            setLoading(prev => ({ ...prev, excel: false }));
        }
    };

    const handleAction = async (modal, id) => {
        if (modal) {
            fetchByID(id);
            setModal(prev => ({ ...prev, pdf: true }));
        } else {
            setModal(prev => ({ ...prev, pdf: false }));
            setBilling(INITIAL_STATE);
        }
    }

    const handleSelect = (id) => {
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter(item => item !== id));
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    };

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            const allIds = data.map(dt => dt.id);
            setSelectedIds(allIds);
        } else {
            setSelectedIds([]);
        }
    };

    const handleDeleteModal = (type, modal, id) => {
        if (type === "single") {
            setSelectedIds([id]);
        }
        if (!modal) {
            setSelectedIds([]);
        }
        setModal(prev => ({ ...prev, delete: modal }));
    }

    const formatDate = (dateString) => {
        if (!dateString) return '';
        return new Date(dateString).toLocaleDateString('en-GB').replace(/\//g, '-');
    };

    const hasActiveFilters = Object.values(filter).some(value => value.trim() !== "");

    return (
        <>
            <div id="admin-section" className="container-fluid">
                <div className="bg-white shadow-sm rounded-3 p-4 mx-0">
                    <div className="row g-3 align-items-center mb-4">
                        <div className="col-lg-9 col-12 position-relative">
                            <input placeholder="Search by invoice no, name, phone number..." type="text" name="search" value={filter.search} onChange={handleFilterChange} className="form-control shadow-input pe-5" />
                            <img className="search-icon position-absolute top-50 translate-middle-y end-0 me-3" src="/media/icons/search.png" alt="search-icon" />
                        </div>
                        <div className="col-lg-3 col-sm-6 col-12">
                            <button disabled={!hasActiveFilters} onClick={handleClearFilters} className="btn form-control text-uppercase fw-bold shadow-none grey-btn py-2">
                                clear all filters
                            </button>
                        </div>
                    </div>
                    <div className="row g-3 align-items-center">
                        <div className="col-md-3 col-12">
                            <select name="payment" value={filter.payment} onChange={handleFilterChange} className="form-select shadow-input">
                                <option value="">All Payments</option>
                                {FILTER_FIELDS.payment.map((opt) => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="col-md-3 col-12">
                            <select name="plan" value={filter.plan} onChange={handleFilterChange} className="form-select text-capitalize shadow-input">
                                <option value="">All Plans</option>
                                {plans.map((dt) => (
                                    <option className="text-capitilize" key={dt.id} value={dt.id ? dt.id : "no_plan"}>{dt.name ? dt.name : "No Plan"}</option>
                                ))}
                            </select>
                        </div>
                        <div className="col-md-3 col-6">
                            <div className="input-group">
                                <span className="input-group-text bg-light text-muted small py-1 px-2">From</span>
                                <input type="date" name="startDate" value={filter.startDate || ""} onChange={handleFilterChange} className="form-control shadow-input" />
                            </div>
                        </div>
                        <div className="col-md-3 col-6">
                            <div className="input-group">
                                <span className="input-group-text bg-light text-muted small py-1 px-2">To</span>
                                <input type="date" name="endDate" value={filter.endDate || ""} onChange={handleFilterChange} className="form-control shadow-input" min={filter.startDate} />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="row mt-5 mx-0">
                    {/* <div className="col-lg-3 col-md-4 col-6 px-0">
                        <button style={{ pointerEvents: selectedIds.length > 0 ? "auto" : "none", transition: "all 0.3s ease-in-out" }} onClick={() => handleDeleteModal("multi", true)} className={`btn form-control text-uppercase fw-bold shadow-none black-btn multi-delete-btn ${selectedIds.length > 0 ? "show" : "hide"}`}>delete selected ({selectedIds.length})</button>
                    </div> */}
                    <div className="d-flex align-items-center px-0">
                        <div className="col-lg-3 col-md-4 col-5 px-0">
                            <button style={{ pointerEvents: selectedIds.length > 0 ? "auto" : "none", transition: "all 0.3s ease-in-out" }} onClick={() => handleDeleteModal("multi", true)} className={`btn form-control text-uppercase fw-bold shadow-none black-btn multi-delete-btn px-5 py-2 ${selectedIds.length > 0 ? "show" : "hide"}`}>delete selected ({selectedIds.length})</button>
                        </div>
                        <div className="offset-lg-3 offset-md-2 offset-1 col-lg-6 col-md-6 col-6 d-flex justify-content-end align-items-center px-0">
                            {/* <p className="bg-white shadow-sm rounded-3 py-2 px-3 m-0">
                                {hasActiveFilters ? (
                                    totalRows === 0 ? (
                                        <span className="fw-semibold text-muted">No matching invoices found.</span>
                                    ) : (
                                        <span className="text-muted">Showing <b className="text-dark">{totalRows}</b> invoice out of <b className="text-dark">{globalCount.total}</b></span>
                                    )
                                ) : (
                                    <>
                                        <span className="text-muted">Total Invoice: <b className="text-dark">{globalCount.total}</b></span>
                                        <span className="text-muted px-3">Generated: <b className="text-dark">{globalCount.active}</b></span>
                                        <span className="text-muted">Non Generated: <b className="text-dark">{globalCount.inactive}</b></span>
                                    </>
                                )}
                            </p> */}
                        </div>
                    </div>
                    <div className="col-12 overflow-hidden shadow-sm rounded-3 mt-3 px-0">
                        <div className="table-responsive">
                            <table className={`table text-center table-bordered align-middle ${data.length !== 0 ? "table-hover" : ""} mb-0`}>
                                <thead className="text-uppercase align-middle">
                                    <tr>
                                        <th>
                                            {data.length > 0 && (
                                                <input type="checkbox" onChange={handleSelectAll} checked={data.length > 0 && selectedIds.length === data.length} className="shadow-none me-1" />
                                            )} all
                                        </th>
                                        <th>s.no.</th>
                                        <th>invoice no</th>
                                        <th>member name</th>
                                        <th>member phone</th>
                                        <th>plan name</th>
                                        <th>payment status</th>
                                        <th>created at</th>
                                        <th>action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading.table ? (
                                        <tr>
                                            <td colSpan={9} className="py-2"><div className="table-spinner spinner mx-auto"></div></td>
                                        </tr>
                                    ) : data.length === 0 ? (
                                        <tr>
                                            <td colSpan={9} className="text-uppercase fw-bold text-muted">no data</td>
                                        </tr>
                                    ) : (
                                        data.map((billing, index) => (
                                            <tr key={billing.id}>
                                                <td><input type="checkbox" checked={selectedIds.includes(billing.id)} onChange={() => handleSelect(billing.id)} className="shadow-none" /></td>
                                                <td>{startingSerialNumber + index + 1}</td>
                                                <td>{billing.invoice_no}</td>
                                                <td>{billing.member_name}</td>
                                                <td>{billing.member_phone}</td>
                                                <td>{billing.plan_name ? billing.plan_name : "No Plan"}</td>
                                                <td>{billing.payment_status}</td>
                                                <td>{formatDate(billing.created_at)}</td>
                                                <td>
                                                    <div className="d-flex justify-content-center gap-3">
                                                        <button onClick={() => handleDeleteModal("single", true, billing.id)} className="d-flex btn px-3 py-2 delete-btn">
                                                            <img className="action-icon" src="/media/icons/delete.png" alt="delete-icon" />
                                                        </button>
                                                        <button onClick={() => handleAction(true, billing.id)} className="d-flex btn px-3 py-2 bill-btn">
                                                            <img className="action-icon" src="/media/icons/pdf.png" alt="bill-icon" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
                {data.length > 0 && (
                    <div className="row align-items-center mt-4">
                        <div className="offset-md-3 col-md-6 col-12 d-flex justify-content-center align-items-center">
                            <button disabled={currentPage === 1 || loading.table} onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} className="d-flex btn fw-bold text-uppercase shadow-sm page-btn px-3 py-2">prev</button>
                            <p className="fw-bold mx-4 my-0">{currentPage}/{totalPages || 1}</p>
                            <button disabled={currentPage === totalPages || totalPages === 0 || loading.table} onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} className="d-flex btn fw-bold text-uppercase shadow-sm page-btn px-3 py-2">next</button>
                        </div>
                        <div className="col-md-3 col-12 mt-md-0 mt-4">
                            <button onClick={handleExcel} disabled={loading.excel || data.length === 0} className="btn form-control text-uppercase fw-bold shadow-none green-btn">{loading.excel ? <div className="excel-spinner spinner mx-auto"></div> : "download excel"}</button>
                        </div>
                    </div>
                )}
            </div>

            {modal.pdf &&
                <section id="action-modal-section" className="position-fixed top-0 bottom-0 start-0 end-0 z-1 d-flex align-items-center">
                    <div className="container">
                        <div className="row justify-content-center">
                            <div className="col-xl-8 col-lg-9 col-12 action-modal-div position-relative shadow-sm rounded-3 py-5 px-4">
                                <button onClick={() => handleAction(false)} className='close-btn d-flex justify-content-center align-items-center position-absolute rounded-circle p-0'>
                                    <img className="close-icon" src="/media/icons/close.png" alt="close icon" />
                                </button>
                                <h2 className="text-center text-uppercase fw-bold">invoice details</h2>
                                <div className="modal-body px-4 mt-4">
                                    {loading.modal ? (
                                        <div className="modal-spinner spinner mx-auto"></div>
                                    ) : (
                                        <form onSubmit={handleForm}>
                                            <div className="row mb-md-4">
                                                <div className="col-md-4 col-12 mb-md-0 mb-3">
                                                    <label className="form-label">Invoice No</label>
                                                    <input type="text" disabled value={billing.invoice_no} className="form-control shadow-input" />
                                                </div>
                                                <div className="col-md-4 col-12 mb-md-0 mb-3">
                                                    <label className="form-label">Plan Name</label>
                                                    <input type="text" disabled value={billing.plan_name || "No Plan"} className="form-control shadow-input" />
                                                </div>
                                                <div className="col-md-4 col-12 mb-md-0 mb-3">
                                                    <label className="form-label">Created At</label>
                                                    <input type="text" disabled value={formatDate(billing.created_at)} className="form-control shadow-input" />
                                                </div>
                                            </div>
                                            <div className="row mb-md-4">
                                                <div className="col-md-6 col-12 mb-md-0 mb-3">
                                                    <label className="form-label">Member Name</label>
                                                    <input type="text" disabled value={billing.member_name} className="form-control shadow-input" />
                                                </div>
                                                <div className="col-md-6 col-12 mb-md-0 mb-3">
                                                    <label className="form-label">Phone Number (+91)</label>
                                                    <input type="phone" disabled value={billing.member_phone} className="form-control shadow-input" />
                                                </div>
                                            </div>
                                            <div className="row mb-md-4">
                                                <div className="col-md-4 col-12 mb-md-0 mb-3">
                                                    <label className="form-label">Member ID</label>
                                                    <input type="text" disabled value={`FIT-${String(billing.member_id).padStart(3, '0')}`} className="form-control shadow-input" />
                                                </div>
                                                <div className="col-md-4 col-12 mb-md-0 mb-3">
                                                    <label className="form-label">Payment Status</label>
                                                    <input type="text" disabled value={billing.payment_status || "N/A"} className="form-control shadow-input" />
                                                </div>
                                                <div className="col-md-4 col-12 mb-md-0 mb-3">
                                                    <label className="form-label">Plan Expiry Date</label>
                                                    <input type="text" disabled value={formatDate(billing.plan_expiry_date) || "N/A"} className="form-control shadow-input" />
                                                </div>
                                            </div>
                                            <div className="row mb-md-4">
                                                <div className="col-md-4 col-12 mb-md-0 mb-3">
                                                    <label className="form-label">Total Amount (₹)</label>
                                                    <input type="number" disabled value={billing.total_amount || 0} className="form-control shadow-input" />
                                                </div>
                                                <div className="col-md-4 col-12 mb-md-0 mb-3">
                                                    <label className="form-label">Pay Amount (₹)</label>
                                                    <input type="number" disabled value={billing.pay_amount || 0} className="form-control shadow-input" />
                                                </div>
                                                <div className="col-md-4 col-12 mb-md-0 mb-3">
                                                    <label className="form-label">Remaining Amount (₹)</label>
                                                    <input type="number" disabled value={billing.remaining_amount || 0} className="form-control shadow-input" />
                                                </div>
                                            </div>
                                            <div className="d-flex flex-column flex-sm-row mt-4">
                                                <button onClick={() => handleAction(false)} className="btn text-uppercase fw-bold shadow-none form-control cancel-btn order-2 order-sm-1 mt-sm-0 mt-2 me-md-4 me-sm-2">cancel</button>
                                                <button type="submit" disabled={loading.pdf} className="btn text-uppercase fw-bold shadow-none form-control black-btn order-1 order-md-2">
                                                    {loading.pdf ? <div className="action-spinner spinner mx-auto"></div> : "download invoice"}
                                                </button>
                                            </div>
                                        </form>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            }

            <DeleteModal isOpen={modal.delete} isLoading={loading.delete} itemCount={selectedIds.length} onClose={() => handleDeleteModal(false)} onConfirm={handleDelete} title={"Invoice"} />
        </>
    );
}

export default Billing;