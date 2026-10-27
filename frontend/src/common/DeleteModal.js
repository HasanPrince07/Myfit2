function DeleteModal({ isOpen, isLoading, itemCount, onClose, onConfirm, title }) {
    return (
        <>
            {isOpen &&
                <section id="information-modal-section" className="position-fixed top-0 bottom-0 start-0 end-0 z-1 d-flex align-items-center" role="dialog" aria-modal="true">
                    <div className="container">
                        <div className="row justify-content-center">
                            <div className="col-xl-6 col-lg-8 col-12 information-modal-div shadow-sm rounded-3 p-sm-5 p-4">
                                <div className="d-flex justify-content-center">
                                    <img src="/media/icons/delete-img.png" alt="delete-icon" />
                                </div>
                                <h2 className="text-center text-uppercase fw-bold mt-4">Delete {itemCount === 1 ? `${title}` : `${itemCount} ${title}s`}?</h2>
                                <p className="text-muted text-center px-3">Do you really want to delete {itemCount === 1 ? `this record` : `these ${itemCount} records`}? This process cannot be undone.</p>
                                <div className="d-flex mt-2">
                                    <button onClick={onClose} className="btn form-control text-uppercase shadow-none fw-bold light-btn me-3">cancel</button>
                                    <button onClick={onConfirm} disabled={isLoading} className="btn form-control text-uppercase shadow-none fw-bold red-btn">{isLoading ? <div className="information-spinner spinner mx-auto"></div> : "delete"}</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            }
        </>
    );
}

export default DeleteModal;