import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import * as XLSX from 'xlsx';
import DeleteModal from "../common/DeleteModal";
import "./Admin.css";

// plan duration options sko htakr day/month/year ka option dena he jisme custom day/month/year ka plan add kiya ja ske

const INITIAL_STATE = { name: "", price: "", duration: "", custom_days: 0, description: "", is_active: true }
const INITIAL_FILTERS = { search: "", duration: "", status: "" }
const INITIAL_GLOBAL_COUNT = { total: 0, active: 0, inactive: 0 }

const FILTER_FIELDS = {
    duration: [
        { value: "1_month", label: "1 Month" },
        { value: "3_months", label: "3 Month (Quaterly)" },
        { value: "6_months", label: "6 Month (Half-Yearly)" },
        { value: "12_months", label: "12 Month (Yearly)" },
        { value: "custom", label: "Custom Days" }
    ],
    status: [
        { value: "true", label: "Active" },
        { value: "false", label: "Inactive" }
    ]
};

const FILTER_UI = [
    { name: 'duration', label: 'All Duration', options: FILTER_FIELDS.duration },
    { name: 'status', label: 'All Status', options: FILTER_FIELDS.status }
]

function Plan() {

    const [plan, setPlan] = useState(INITIAL_STATE);
    const [filter, setFilter] = useState(INITIAL_FILTERS);
    const [data, setData] = useState([]);
    const [modal, setModal] = useState({ action: false, delete: false, information: false });
    const [modalMode, setModalMode] = useState("add");
    const [loading, setLoading] = useState({ table: false, modal: false, add: false, edit: false, delete: false, excel: false });
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [id, setId] = useState(null);
    const [selectedIds, setSelectedIds] = useState([]);

    const [globalCount, setGlobalCount] = useState(INITIAL_GLOBAL_COUNT);
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
            const res = await fetch(`/admin/fetch-plans?limit=${limit}&offset=${offset}&search=${currentFilters.search}&duration=${currentFilters.duration}&status=${currentFilters.status}`, {
                method: "GET",
                credentials: "include",
            });
            const resData = await res.json();
            if (!res.ok) {
                setData([]);
                setTotalRows(0);
                setGlobalCount(INITIAL_GLOBAL_COUNT);
                toast(resData.message, { type: "error" });
                return;
            }
            setData(resData.data || []);
            setTotalRows(resData.totalRows || 0);
            setGlobalCount(resData.globalCount);
        } catch (error) {
            toast("Network error, please check your internet", { type: "error" });
            console.error("Error during fetch plans:", error);
        } finally {
            setLoading(prev => ({ ...prev, table: false }));
        }
    }, [itemsPerPage]);

    useEffect(() => {
        handleFetch(filter, currentPage);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [handleFetch, currentPage]);

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

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        let finalValue = type === "checkbox" ? checked : value;
        if (name === "price" || name === "custom_days") {
            finalValue = value.replace(/\D/g, "");
            if (name === "price" && finalValue.length > 10) return;
            if (name === "custom_days" && finalValue.length > 3) return;
        }
        setPlan(prev => {
            const updated = { ...prev, [name]: finalValue };
            if (name === "duration" && value !== "custom") {
                updated.custom_days = "";
            }
            return updated;
        });
    };

    const validation = useMemo(() => {
        const nameStr = String(plan.name || "").trim();
        const priceStr = String(plan.price ?? "").trim();
        const durationStr = String(plan.duration || "").trim();
        const customDaysStr = String(plan.custom_days ?? "").trim();

        const isNameValid = nameStr.length > 0;
        const isPriceValid = priceStr.length > 0;
        const isDurationValid = durationStr.length > 0;
        const isCustomDaysValid = plan.duration === "custom"
            ? (customDaysStr.length > 0 && parseInt(customDaysStr, 10) > 0)
            : true;

        return {
            isValid: isNameValid && isPriceValid && isDurationValid && isCustomDaysValid,
            errors: {
                name: isSubmitted && !isNameValid,
                price: isSubmitted && !isPriceValid,
                duration: isSubmitted && !isDurationValid,
                customDays: isSubmitted && !isCustomDaysValid
            }
        };
    }, [plan, isSubmitted]);

    const handleForm = async (e) => {
        e.preventDefault();
        setIsSubmitted(true);
        if (!validation.isValid) return;
        const loadingKey = id ? "edit" : "add";
        setLoading(prev => ({ ...prev, [loadingKey]: true }));
        try {
            const planId = id || "new";
            const cleanedPlan = {
                ...plan,
                name: String(plan.name || "").trim(),
                duration: String(plan.duration || "").trim(),
                description: String(plan.description || "").trim(),
                price: plan.price !== null && plan.price !== undefined ? parseFloat(plan.price) : 0,
                custom_days: plan.duration === "custom" ? parseInt(plan.custom_days, 10) : null
            };
            const res = await fetch(`/admin/action-plan/${planId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(cleanedPlan)
            });
            const resData = await res.json();
            if (!res.ok) {
                toast(resData.message, { type: "error" });
                return;
            }
            if (id) {
                handleFetch(filter, currentPage);
            } else {
                setFilter(INITIAL_FILTERS);
                setCurrentPage(1);
                handleFetch(INITIAL_FILTERS, 1);
            }
            closeModal();
            toast(resData.message, { type: "success" });
        } catch (error) {
            toast("Network error, please check your internet", { type: "error" });
            console.error("Error during insert or update plan:", error);
        } finally {
            setLoading(prev => ({ ...prev, [loadingKey]: false }));
        }
    }

    const fetchByID = useCallback(async (id) => {
        setLoading(prev => ({ ...prev, modal: true }));
        try {
            const res = await fetch(`/admin/fetch-plan-by-id/${id}`, {
                method: "GET",
                credentials: "include"
            });
            const resData = await res.json();
            if (!res.ok) {
                toast(resData.message, { type: "error" });
                return;
            }
            setPlan(resData.data);
        } catch (error) {
            toast("Network error, please check your internet", { type: "error" });
            console.error("Error during fetch plan by id:", error);
        } finally {
            setLoading(prev => ({ ...prev, modal: false }));
        }
    }, []);

    const handleDelete = async () => {
        if (selectedIds.length === 0) return;
        setLoading(prev => ({ ...prev, delete: true }));
        try {
            const res = await fetch("/admin/delete-plans", {
                method: "DELETE",
                credentials: "include",
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: selectedIds })
            });
            const resData = await res.json();
            if (!res.ok) {
                toast(resData.message, { type: "error" });
                return;
            }
            setSelectedIds([]);
            const isPageEmptyAfterDelete = data.length === selectedIds.length;
            const nextPage = (currentPage > 1 && isPageEmptyAfterDelete) ? currentPage - 1 : currentPage;
            if (nextPage !== currentPage) {
                setCurrentPage(nextPage);
            }
            handleFetch(filter, nextPage);
            setModal(prev => ({ ...prev, delete: false }));
            toast(resData.message, { type: "success" });
        } catch (error) {
            toast("Network error, please check your internet", { type: "error" });
            console.error("Error during delete plans:", error);
        } finally {
            setLoading(prev => ({ ...prev, delete: false }));
        }
    }

    const handleExcel = async () => {
        try {
            setLoading(prev => ({ ...prev, excel: true }));
            const res = await fetch(`/admin/fetch-plans?limit=ALL&offset=0&search=${filter.search}&duration=${filter.duration}&status=${filter.status}`, {
                method: "GET",
                credentials: "include",
            });
            const resData = await res.json();
            if (!res.ok) {
                toast(resData.message, { type: "error" });
                return;
            }
            const excelRows = resData.data.map((plan, index) => ({
                "S.No.": index + 1,
                "Plan Name": plan.name,
                "Price (₹)": plan.price,
                "Duration": formatDuration(plan.duration, plan.custom_days),
                "Total Members": plan.total_members || 0,
                "Created At": formatDate(plan.created_at),
                "Status": plan.is_active ? "Active" : "Inactive",
                "Description": plan.description
            }));
            const worksheet = XLSX.utils.json_to_sheet(excelRows);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Plan List");
            const fileName = `Plans_Report_${new Date().toISOString().split('T')[0]}.xlsx`;
            XLSX.writeFile(workbook, fileName);
            toast("Excel Sheet Downloaded!", { type: "success" });
        } catch (error) {
            toast("Network error, please check your internet", { type: "error" });
            console.error("Error during download excel sheet:", error);
        } finally {
            setLoading(prev => ({ ...prev, excel: false }));
        }
    };

    const handleAction = (mode, id) => {
        setIsSubmitted(false);
        setId(id);
        setModal(prev => ({ ...prev, action: true }));
        setModalMode(mode);
        if (mode === "edit" || mode === "view") {
            fetchByID(id);
        } else {
            setPlan(INITIAL_STATE);
        }
    };

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

    const closeModal = () => {
        setPlan(INITIAL_STATE);
        setId(null);
        setIsSubmitted(false);
        setModal(prev => ({ ...prev, action: false }));
    }

    const handleDeleteModal = (type, modal, id, memberCount) => {
        if (type === "single") {
            setSelectedIds([id]);
        }
        if (type === "single" && memberCount > 0) {
            setModal(prev => ({ ...prev, information: modal }));
            return;
        }
        if (type === "multi" && modal === true) {
            const hasMembers = data.filter(plan => selectedIds.includes(plan.id)).some(plan => plan.total_members > 0);
            if (hasMembers) {
                setModal(prev => ({ ...prev, information: modal }));
                return;
            }
        }
        if (!modal) {
            setSelectedIds([]);
        }
        setModal(prev => ({ ...prev, delete: modal }));
    }

    const closeInformationModal = () => {
        setSelectedIds([]);
        setModal(prev => ({ ...prev, information: false }));
    }

    const formatDuration = (duration, customDays) => {
        if (duration === 'custom') {
            const unit = parseInt(customDays, 10) === 1 ? 'Day' : 'Days';
            return `${customDays} ${unit}`;
        }
        return duration.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
    };

    const formatDate = (dateString) => {
        if (!dateString) return '';
        return new Date(dateString).toLocaleDateString('en-GB').replace(/\//g, '-');
    };

    const hasActiveFilters = Object.values(filter).some(value => value.trim() !== "");

    const modalTitles = {
        add: 'Add New Plan',
        edit: 'Edit Plan Details',
        view: 'Plan Details'
    };

    return (
        <>
            <div id="admin-section" className="container-fluid">
                <div className="bg-white shadow-sm rounded-3 p-4 mx-0">
                    <div className="row g-3 align-items-center mb-4">
                        <div className="col-lg-6 col-12 position-relative">
                            <input placeholder="Search by plan name, duration..." type="text" name="search" value={filter.search} onChange={handleFilterChange} className="form-control shadow-input pe-5" />
                            <img className="search-icon position-absolute top-50 translate-middle-y end-0 me-3" src="/media/icons/search.png" alt="search-icon" />
                        </div>
                        <div className="col-lg-3 col-sm-6 col-12">
                            <button onClick={() => handleAction("add")} className="btn form-control text-uppercase fw-bold shadow-none green-btn py-2">
                                add plan
                            </button>
                        </div>
                        <div className="col-lg-3 col-sm-6 col-12">
                            <button disabled={!hasActiveFilters} onClick={handleClearFilters} className="btn form-control text-uppercase fw-bold shadow-none grey-btn py-2">
                                clear all filters
                            </button>
                        </div>
                    </div>
                    <div className="row g-3 align-items-center">
                        {FILTER_UI.map((field) => (
                            <div key={field.name} className="col-md-6 col-12">
                                <select name={field.name} value={filter[field.name]} onChange={handleFilterChange} className="form-select shadow-input">
                                    <option value="">{field.label}</option>
                                    {field.options.map((opt) => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="row mt-5 mx-0">
                    <div className="d-flex align-items-center px-0">
                        <div className="col-lg-3 col-md-4 col-5 px-0">
                            <button style={{ pointerEvents: selectedIds.length > 0 ? "auto" : "none", transition: "all 0.3s ease-in-out" }} onClick={() => handleDeleteModal("multi", true)} className={`btn form-control text-uppercase fw-bold shadow-none black-btn multi-delete-btn px-5 py-2 ${selectedIds.length > 0 ? "show" : "hide"}`}>delete selected ({selectedIds.length})</button>
                        </div>
                        <div className="offset-lg-3 offset-md-2 offset-1 col-lg-6 col-md-6 col-6 d-flex justify-content-end align-items-center px-0">
                            <p className="bg-white shadow-sm rounded-3 py-2 px-3 m-0">
                                {hasActiveFilters ? (
                                    totalRows === 0 ? (
                                        <span className="fw-semibold text-muted">No matching plans found.</span>
                                    ) : (
                                        <span className="text-muted">Showing <b className="text-dark">{totalRows}</b> plan{totalRows > 1 && "s"} out of <b className="text-dark">{globalCount.total}</b></span>
                                    )
                                ) : (
                                    <>
                                        <span className="text-muted">Total Plans: <b className="text-dark">{globalCount.total}</b></span>
                                        <span className="text-muted px-3">Active: <b className="text-dark">{globalCount.active}</b></span>
                                        <span className="text-muted">Inactive: <b className="text-dark">{globalCount.inactive}</b></span>
                                    </>
                                )}
                            </p>
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
                                        <th>name</th>
                                        <th>price</th>
                                        <th>duration</th>
                                        <th>members</th>
                                        <th>created at</th>
                                        <th>status</th>
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
                                        data.map((plan, index) => (
                                            <tr key={plan.id}>
                                                <td><input type="checkbox" checked={selectedIds.includes(plan.id)} onChange={() => handleSelect(plan.id)} className="shadow-none" /></td>
                                                <td>{startingSerialNumber + index + 1}</td>
                                                <td className="text-capitalize">{plan.name}</td>
                                                <td>₹ {plan.price}</td>
                                                <td>{formatDuration(plan.duration, plan.custom_days)}</td>
                                                <td>{plan.total_members || 0}</td>
                                                <td>{formatDate(plan.created_at)}</td>
                                                <td>
                                                    <span className={`d-inline-block alert ${plan.is_active ? "alert-success" : "alert-danger"} py-1 px-2 m-0`}>{plan.is_active ? "Active" : "Inactive"}</span>
                                                </td>
                                                <td>
                                                    <div className="d-flex justify-content-center gap-3">
                                                        <button onClick={() => handleAction("edit", plan.id)} className="d-flex btn px-3 py-2 edit-btn">
                                                            <img className="action-icon" src="/media/icons/edit.png" alt="edit-icon" />
                                                        </button>
                                                        <button onClick={() => handleDeleteModal("single", true, plan.id, plan.total_members)} className="d-flex btn px-3 py-2 delete-btn">
                                                            <img className="action-icon" src="/media/icons/delete.png" alt="delete-icon" />
                                                        </button>
                                                        <button onClick={() => handleAction("view", plan.id)} className="d-flex btn px-3 py-2 view-btn">
                                                            <img className="action-icon" src="/media/icons/view.png" alt="view-icon" />
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

            {modal.action &&
                <section id="action-modal-section" className="position-fixed top-0 bottom-0 start-0 end-0 z-1 d-flex align-items-center">
                    <div className="container">
                        <div className="row justify-content-center">
                            <div className="col-xl-8 col-lg-9 col-12 action-modal-div position-relative shadow-sm rounded-3 py-5 px-4">
                                <button onClick={closeModal} className='close-btn d-flex justify-content-center align-items-center position-absolute rounded-circle p-0'>
                                    <img className="close-icon" src="/media/icons/close.png" alt="close icon" />
                                </button>
                                <h2 className="text-center text-uppercase fw-bold">{modalTitles[modalMode]}</h2>
                                <div className="modal-body px-4 mt-4">
                                    {loading.modal ? (
                                        <div className="modal-spinner spinner mx-auto"></div>
                                    ) : (
                                        <form onSubmit={handleForm}>
                                            <div className={`row ${validation.errors.name || validation.errors.price ? "mb-md-3" : "mb-md-4"}`}>
                                                <div className={`${modalMode !== "edit" ? "col-md-6" : "col-12"} col-12 mb-md-0 ${validation.errors.name ? "mb-2" : "mb-3"}`}>
                                                    <label className="form-label">Plan Name {modalMode !== "view" && <span className="text-danger">*</span>}</label>
                                                    <input type="text" disabled={modalMode === "view"} name="name" value={plan.name || ""} onChange={handleChange} className={`form-control shadow-input ${validation.errors.name ? "is-invalid" : ""}`} placeholder="e.g., Gold Membership, Quarterly Plan" />
                                                    <div className="invalid-feedback">
                                                        Plan name is required
                                                    </div>
                                                </div>
                                                {modalMode !== "edit" && (
                                                    <div className={`col-md-6 col-12 mb-md-0 ${validation.errors.price ? "mb-2" : "mb-3"}`}>
                                                        <label className="form-label">Plan Price (₹) {modalMode === "add" && <span className="text-danger">*</span>}</label>
                                                        <input type="text" inputMode="numeric" disabled={modalMode !== "add"} name="price" value={plan.price ?? ""} onChange={handleChange} className={`form-control shadow-input ${validation.errors.price ? "is-invalid" : ""}`} placeholder="e.g., 3000" />
                                                        <div className="invalid-feedback">
                                                            Plan price is required
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            {modalMode !== "edit" && (
                                                <div className={`row ${validation.errors.duration || validation.errors.customDays ? "mb-md-3" : "mb-md-4"}`}>
                                                    <div className={`${plan.duration === "custom" ? "col-md-6 col-12" : "col-12"} mb-md-0 ${validation.errors.duration ? "mb-2" : "mb-3"}`}>
                                                        <label className="form-label">Plan Duration {modalMode === "add" && <span className="text-danger">*</span>}</label>
                                                        {modalMode !== "add" ? (
                                                            <input disabled value={plan.duration || ""} className="form-control shadow-input" />
                                                        ) : (
                                                            <select name="duration" value={plan.duration || ""} onChange={handleChange} className={`form-select shadow-input ${validation.errors.duration ? "is-invalid" : ""}`}>
                                                                <option value="">Select Duration</option>
                                                                <option value="1 month">1 Month</option>
                                                                <option value="3 months">3 Months (Quarterly)</option>
                                                                <option value="6 months">6 Months (Half-Yearly)</option>
                                                                <option value="12 months">12 Months (Yearly)</option>
                                                                <option value="custom">Custom Days</option>
                                                            </select>
                                                        )}
                                                        <div className="invalid-feedback">
                                                            Plan duration is required
                                                        </div>
                                                    </div>
                                                    {plan.duration === "custom" && (
                                                        <div className={`col-md-6 col-12 mb-md-0 ${validation.errors.customDays ? "mb-2" : "mb-3"}`}>
                                                            <label className="form-label">Enter Number of Days {modalMode === "add" && <span className="text-danger">*</span>}</label>
                                                            <input type="text" inputMode="numeric" disabled={modalMode !== "add"} name="custom_days" value={plan.custom_days || ""} onChange={handleChange} className={`form-control shadow-input ${validation.errors.customDays ? "is-invalid" : ""}`} placeholder="Enter days (e.g., 30)" />
                                                            <div className="invalid-feedback">
                                                                {String(plan.custom_days || "").trim().length === 0 ? "Number of days is required" : "Number of days should be greater then 0"}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            {modalMode === "view" && (
                                                <div className="row mb-md-4">
                                                    <div className="col-md-6 col-12 mb-md-0 mb-3">
                                                        <label className="form-label">Total Members</label>
                                                        <input type="text" disabled value={plan.total_members} className="form-control shadow-input" />
                                                    </div>
                                                    <div className="col-md-6 col-12 mb-md-0 mb-3">
                                                        <label className="form-label">Created At</label>
                                                        <input type="text" disabled value={formatDate(plan.created_at)} className="form-control shadow-input" />
                                                    </div>
                                                </div>
                                            )}
                                            <div className="row mb-md-4 mb-3">
                                                <div className="col-12">
                                                    <label className="form-label">Plan Description</label>
                                                    <textarea rows={3} type="text" disabled={modalMode === "view"} name="description" value={modalMode === "view" ? (plan.description && plan.description.trim() !== "" ? plan.description : "No description provided") : plan.description} onChange={handleChange} className="form-control shadow-input" placeholder="e.g., Access to Gym + Cardio, Includes Personal Trainer for 1 Month"></textarea>
                                                </div>
                                            </div>
                                            {modalMode !== "add" && (
                                                <div className="row mb-md-4 mb-3">
                                                    <div className="col-12">
                                                        {modalMode === "view" ?
                                                            <div className="form-check form-switch">
                                                                <input readOnly type="checkbox" className="form-check-input shadow-none" checked={plan.is_active || false} />
                                                                <label className="form-check-label">{plan.is_active ? "Active" : "Inactive"}</label>
                                                            </div>
                                                            :
                                                            <div className="form-check form-switch">
                                                                <input type="checkbox" className="form-check-input shadow-none" id="activePlan" name="is_active" onChange={handleChange} checked={plan.is_active || false} />
                                                                <label className="form-check-label" htmlFor="activePlan">{plan.is_active ? "Active" : "Inactive"}</label>
                                                            </div>
                                                        }
                                                    </div>
                                                </div>
                                            )}
                                            <div className="d-flex flex-column flex-sm-row mt-4">
                                                {modalMode !== "view" ?
                                                    <>
                                                        <button onClick={closeModal} className="btn text-uppercase fw-bold shadow-none form-control cancel-btn order-2 order-sm-1 mt-sm-0 mt-2 me-3">cancel</button>
                                                        <button type="submit" disabled={modalMode === "add" ? loading.add : loading.edit} className="btn text-uppercase fw-bold shadow-none form-control black-btn order-1 order-md-2">
                                                            {(modalMode === "add" ? loading.add : loading.edit) ? (
                                                                <div className="action-spinner spinner mx-auto"></div>
                                                            ) : (
                                                                modalMode === "add" ? "add plan" : "save changes"
                                                            )}
                                                        </button>
                                                    </>
                                                    :
                                                    <button onClick={closeModal} type="button" className="btn text-uppercase fw-bold shadow-none form-control black-btn order-1 order-md-2">done</button>
                                                }
                                            </div>
                                        </form>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            }

            {modal.information &&
                <section id="information-modal-section" className="position-fixed top-0 bottom-0 start-0 end-0 z-1 d-flex align-items-center" role="dialog" aria-modal="true">
                    <div className="container">
                        <div className="row justify-content-center">
                            <div className="col-xl-6 col-lg-8 col-12 information-modal-div shadow-sm rounded-3 p-sm-5 p-4">
                                <div className="d-flex justify-content-center">
                                    <img className="img-responsive" src="/media/icons/alert-img.png" alt="delete-icon" />
                                </div>
                                <p className="text-muted text-center mt-4 px-3">You cannot delete {selectedIds.length === 1 ? "this plan" : "these plans"} because {selectedIds.length === 1 ? "it has" : "they have"} active members.</p>
                                <div className="d-flex mt-2">
                                    <button onClick={closeInformationModal} className="col-12 btn text-uppercase shadow-none fw-bold black-btn">done</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            }

            <DeleteModal isOpen={modal.delete} isLoading={loading.delete} itemCount={selectedIds.length} onClose={() => handleDeleteModal(false)} onConfirm={handleDelete} title={"Plan"} />
        </>
    );
}

export default Plan;