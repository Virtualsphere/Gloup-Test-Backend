import dotenv from "dotenv";
import { ApplicationResponse } from "../../core/inc/response/ApplicationResponse.js";
import { ApplicationResult } from "../../core/result.js";
import { Adminappmiddleware } from "../middleware/adminappmiddleware.js";
import { addClient, removeClient } from "../../core/utils/sseManager.js";
dotenv.config();


export const getallusers = async(req, res) => {
    Adminappmiddleware.app.getallusers(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
} 


export const addsubscription= async(req, res) => {
    Adminappmiddleware.app.addsubscription(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}  


export const getalluserbooking = async(req, res) => {
    Adminappmiddleware.app.getalluserbooking(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        }); 
}  

export const getallpartner = async(req, res) => {
    Adminappmiddleware.app.getallpartner(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
} 

export const getallpartnerdetails = async(req, res) => {
    Adminappmiddleware.app.getparnerdetails(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}  


export const getrefundrequests = async(req, res) => {
    Adminappmiddleware.app.getrefundrequests(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}  


export const updatesubscription = async(req, res) => {
    Adminappmiddleware.app.updatesubscription(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}   


export const addpayouts = async(req, res) => {
    Adminappmiddleware.app.addpayouts(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}    


export const addbanner = async(req, res) => {
    Adminappmiddleware.app.addbanner(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}    


export const getbanner = async(req, res) => {
    Adminappmiddleware.app.getbanners(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}    

export const getBookings = async(req, res) => {
    Adminappmiddleware.app.getBookings(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}  

export const getCancelledOrders = async(req, res) => {
    Adminappmiddleware.app.getCancelledOrders(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}  

export const getTopPerformingSalon = async(req, res) => {
    Adminappmiddleware.app.getTopPerformingSalon(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}  

export const getFilterReport = async(req, res) => {
    Adminappmiddleware.app.getFilterReport(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}  

export const getMonthlyReport = async(req, res) => {
    Adminappmiddleware.app.getMonthlyReport(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}

export const getMonthlyBookingsReport = async(req, res) => {
    Adminappmiddleware.app.getMonthlyBookingsReport(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}

export const getBookingsByDateRange = async(req, res) => {
    Adminappmiddleware.app.getBookingsByDateRange(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}

export const getCurrentMonthBookingsCount = async(req, res) => {
    Adminappmiddleware.app.getCurrentMonthBookingsCount(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}

export const getFilteredStores = async(req, res) => {
    Adminappmiddleware.app.getFilteredStores(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}  

export const getCategoryRevenue = async(req, res) => {
    Adminappmiddleware.app.getCategoryRevenue(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
} 

export const getStoreBySearch = async(req, res) => {
    Adminappmiddleware.app.getStoreBySearch(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
} 

export const getStoresByStatus = async(req, res) => {
    Adminappmiddleware.app.getStoresByStatus(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
} 

export const getSalons = async(req, res) => {
    Adminappmiddleware.app.getSalons(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
} 

export const getRevenueCategory = async(req, res) => {
    Adminappmiddleware.app.getRevenueCategory(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
} 

export const getRevenueCategoryGrowth = async(req, res) => {
    Adminappmiddleware.app.getRevenueCategoryGrowth(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
} 

export const updateMultipleStore = async(req, res) => {
    Adminappmiddleware.app.updateMultipleStore(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
} 

export const getAdvancedSearch = async(req, res) => {
    Adminappmiddleware.app.getAdvancedSearch(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}

export const updateSalon = async(req, res) => {
    Adminappmiddleware.app.updateSalon(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
} 

export const getCustomers = async(req, res) => {
    Adminappmiddleware.app.getCustomers(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}

export const sendMarketingWhatsapp = async (req, res) => {
    Adminappmiddleware.app.sendMarketingWhatsapp(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}

export const sendVideoMarketingWhatsapp = async (req, res) => {
    Adminappmiddleware.app.sendVideoMarketingWhatsapp(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}

export const sendMarketingSMS = async (req, res) => {
    Adminappmiddleware.app.sendMarketingSMS(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}

export const getRegisteredStore = async(req, res) => {
    Adminappmiddleware.app.getRegisteredStore(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
} 

export const deletebanner = async(req, res) => {
    Adminappmiddleware.app.deletebanner(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}     


export const addcategory = async(req, res) => {
    Adminappmiddleware.app.addcategory(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}    

export const getallcategory = async(req, res) => {
    Adminappmiddleware.app.getallcategory(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}     



export const deletecategory = async(req, res) => {
    Adminappmiddleware.app.deletecategory(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}    



export const addnotification = async(req, res) => {
    Adminappmiddleware.app.addnotification(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}

export const sendTargetedNotification = async (req, res) => {
    Adminappmiddleware.app.sendTargetedNotification(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}

export const getallnotification = async(req, res) => {
    Adminappmiddleware.app.getallnotification(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}    

export const getnotificationbyid = async(req, res) => {
    Adminappmiddleware.app.getnotificationbyid(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}


export const deletereviewrequest = async(req, res) => {
    Adminappmiddleware.app.deletereviewrequest(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}   

export const getreviewrequest = async(req, res) => {
    Adminappmiddleware.app.getreviewrequest(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}   

export const getallreviews = async(req, res) => {
    Adminappmiddleware.app.getallreviews(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}   



export const updatereviewrequest = async(req, res) => {
    Adminappmiddleware.app.updatereviewrequest(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}    

export const getpayoutlogs = async(req, res) => {
    Adminappmiddleware.app.getpayoutlogs(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
} 



export const getdashboard = async(req, res) => {
    Adminappmiddleware.app.getdashboard(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}    

export const getLiveStats = async (req, res) => {
    Adminappmiddleware.app.getLiveStats(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            let statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
};

export const bookingSSE = async (req, res) => {
  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Send a heartbeat every 30s to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 30000);

  addClient(res);

  // Snapshot current presence so the dashboard is accurate immediately
  try {
    const presence = await import("../../core/utils/presenceService.js");
    const counts = await presence.getPresenceCounts();
    if (counts.active_users_now != null && counts.active_partners_now != null) {
      res.write(
        `data: ${JSON.stringify({
          type: "LIVE_STATS",
          active_users_now: counts.active_users_now,
          active_partners_now: counts.active_partners_now,
          ts: Date.now(),
        })}\n\n`
      );
    } else {
      const data = await Adminappmiddleware.app.getLiveStats();
      res.write(
        `data: ${JSON.stringify({
          type: "LIVE_STATS",
          active_users_now: data.active_users_now,
          active_partners_now: data.active_partners_now,
          ts: Date.now(),
        })}\n\n`
      );
    }
  } catch (err) {
    console.warn("[SSE] initial LIVE_STATS failed:", err?.message || err);
  }

  req.on("close", () => {
    clearInterval(heartbeat);
    removeClient(res);
  });
};

export const getBookingsDetails = async(req, res) => {
    Adminappmiddleware.app.getBookingsDetails(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(        
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}

export const getBookingsDetailsByOrderDate = async(req, res) => {
    Adminappmiddleware.app.getBookingsDetailsByOrderDate(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}

export const updatebookingstatus = async(req, res) => {
    Adminappmiddleware.app.updatebookingstatus(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(    
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        }
        )
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}

export const updaterefundBooking = async(req, res) => {
    Adminappmiddleware.app.updaterefundBookingStatus(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        }
        )
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}

export const addcoupons = async(req, res) => {
    Adminappmiddleware.app.addcoupons(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}   

export const getBookingsDetailsById = async (req, res) => {
    Adminappmiddleware.app.getBookingsDetailsById(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}

export const getallcoupons = async(req, res) => {
    Adminappmiddleware.app.getallcoupons(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}   


export const updatecoupons = async(req, res) => {
    Adminappmiddleware.app.updatecoupons(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}  


export const getallsubscription = async(req, res) => {
    Adminappmiddleware.app.getallsubscription(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}   



// export const addpayouts = async(req, res) => {
//     Adminappmiddleware.app.updatesubscription(req)
//         .then((data) => {
//             const response = ApplicationResult.forCreated();
//             var statuscode = 0;
//             ApplicationResponse.success(
//                 response,
//                 null,
//                 (response) => (statuscode = response.status)
//             );
//             res.json({ status: statuscode, data: data });
//         })
//         .catch((error) => {
//             ApplicationResponse.error(error, null, (response) => {
//                 res.status(response.status).json(response);
//             });
//         });
// } 

export const updatepartner = async(req, res) => {
    Adminappmiddleware.app.updatepartner(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}

export const createService = async(req, res) => {
    console.log('controller')
    Adminappmiddleware.app.createService(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
    });
}

export const bulkCreateServices = async (req, res) => {
    Adminappmiddleware.app.bulkCreateServices(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(response, null, (r) => (statuscode = r.status));
            res.json({ status: statuscode, data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (r) => {
                res.status(r.status).json(r);
            });
        });
};

export const editService = async(req, res) => {
    console.log('controller')
    Adminappmiddleware.app.editService(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
    });
}

export const updateServiceImportant = async(req, res) => {
    Adminappmiddleware.app.updateServiceImportant(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}

export const updateServiceAmount = async(req, res) => {
    Adminappmiddleware.app.updateServiceAmount(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}

export const getPartnerPaymentStatus = async(req, res) => {
    Adminappmiddleware.app.getPartnerPaymentStatus(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(response, null, (response) => (statuscode = response.status));
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}

export const getservicecategorylist = async(req, res) => {
    Adminappmiddleware.app.getservicecategorylist(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        }
        )
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
    });
}

export const updateMultiplePartner = async(req, res) => {
    Adminappmiddleware.app.updateMultiplePartner(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
} 

export const deletePartner = async(req, res) => {
    Adminappmiddleware.app.deletePartner(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
} 

export const createPartner = async(req, res) => {
    Adminappmiddleware.app.createPartner(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}  
export const editPartner = async(req, res) => {
    Adminappmiddleware.app.editPartner(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}  

export const getverifyPartnerlist = async(req, res) => {
    Adminappmiddleware.app.getverifyPartnerlist(req)
        .then((data) => {   
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}

export const verifypartnerdetails = async(req, res) => {
    Adminappmiddleware.app.verifypartnerdetails(req)
        .then((data) => {   
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        }
        )
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}

export const getservices = async(req, res) => {
    Adminappmiddleware.app.getservices(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}

export const deleteservice = async(req, res) => {
    Adminappmiddleware.app.deleteservice(req)
        .then((data) => {
            const response = ApplicationResult.forSuccess();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data, message: "Service deleted successfully" });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}

export const updaterefundrequests = async(req, res) => {
    Adminappmiddleware.app.updaterefundrequests(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}  






export const updateuser = async(req, res) => {
    Adminappmiddleware.app.updateuser(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}

export const getGenderProbabilityUsers = async(req, res) => {
    Adminappmiddleware.app.getGenderProbabilityUsers(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}

export const updateUserGender = async(req, res) => {
    Adminappmiddleware.app.updateUserGender(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}


export const downloadBookingPDF = async (req, res) => {
  try {
    const pdfBuffer = await Adminappmiddleware.app.downloadBookingPDF(req);

    // 🔒 HARD RESET RESPONSE
    res.status(200);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Booking_${req.params.id}.pdf`
    );
    res.setHeader("Content-Length", pdfBuffer.length);

    res.end(pdfBuffer); // ✅ raw binary ONLY

  } catch (error) {
    ApplicationResponse.error(error, null, (response) => {
      res.status(response.status).json(response);
    });
  }
};

export const getInvoicePartnersToday = async (req, res) => {
    Adminappmiddleware.app.getInvoicePartnersToday(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
};

export const getInvoiceDetailsForPartner = async (req, res) => {
    Adminappmiddleware.app.getInvoiceDetailsForPartner(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
};

export const markInvoicePayout = async (req, res) => {
    Adminappmiddleware.app.markInvoicePayout(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
};

export const undoInvoicePayout = async (req, res) => {
    Adminappmiddleware.app.undoInvoicePayout(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
};

export const getPartnersNeedingManualSubscription = async (req, res) => {
    Adminappmiddleware.app.getPartnersNeedingManualSubscription(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
};

export const getAllManualPartnerSubscriptions = async (req, res) => {
    Adminappmiddleware.app.getAllManualPartnerSubscriptions(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
};

export const assignManualPartnerSubscription = async (req, res) => {
    Adminappmiddleware.app.assignManualPartnerSubscription(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
};

export const updateManualPartnerSubscription = async (req, res) => {
    Adminappmiddleware.app.updateManualPartnerSubscription(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
};

export const deactivateManualPartnerSubscription = async (req, res) => {
    Adminappmiddleware.app.deactivateManualPartnerSubscription(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
};

export const resetAllUserPaidBookingCounts = async (req, res) => {
    Adminappmiddleware.app.resetAllUserPaidBookingCounts(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
};

export const downloadInvoicePDF = async (req, res) => {
    try {
        const pdfBuffer = await Adminappmiddleware.app.downloadInvoicePDF(req);

        res.status(200);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename=Invoice_${req.params.partnerId}_${new Date().toISOString().slice(0, 10)}.pdf`
        );
        res.setHeader("Content-Length", pdfBuffer.length);

        res.end(pdfBuffer);
    } catch (error) {
        ApplicationResponse.error(error, null, (response) => {
            res.status(response.status).json(response);
        });
    }
};

export const getInvoicePartnersMonthly = async (req, res) => {
    Adminappmiddleware.app.getInvoicePartnersMonthly(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
};

export const getMonthlyInvoiceDetailsForPartner = async (req, res) => {
    Adminappmiddleware.app.getMonthlyInvoiceDetailsForPartner(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
};

export const downloadMonthlyInvoicePDF = async (req, res) => {
    try {
        const pdfBuffer = await Adminappmiddleware.app.downloadMonthlyInvoicePDF(req);

        res.status(200);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename=MonthlyInvoice_${req.params.partnerId}_${new Date().toISOString().slice(0, 7)}.pdf`
        );
        res.setHeader("Content-Length", pdfBuffer.length);

        res.end(pdfBuffer);
    } catch (error) {
        ApplicationResponse.error(error, null, (response) => {
            res.status(response.status).json(response);
        });
    }
};

export const downloadUsersExcel = async (req, res) => {
  try {
    const excelBuffer = await Adminappmiddleware.app.downloadUsersExcel();
    const dateStamp = new Date().toISOString().slice(0, 10);

    res.status(200);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=gloup_users_${dateStamp}.xlsx`
    );
    res.setHeader("Content-Length", excelBuffer.length);
    res.end(excelBuffer);
  } catch (error) {
    ApplicationResponse.error(error, null, (response) => {
      res.status(response.status).json(response);
    });
  }
};


export const createdefaulttimeslot = async(req, res) => {
    Adminappmiddleware.app.createDefaultTimeSlot(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}

export const blockAndUnblockSlot = async(req, res) => {
    Adminappmiddleware.app.blockAndUnblockSlot(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}

export const getBlockedSlots = async(req, res) => {
    Adminappmiddleware.app.getBlockedSlots(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}


export const getlanguage = async(req, res) => {
    Adminappmiddleware.app.getlanguage(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}

export const getserviceprovidedfor = async(req, res) => {
    Adminappmiddleware.app.getserviceprovidedfor(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
        });
    });
}

// Partner Subscription Controller
export const getallpartnersubscription = async(req, res) => {
    Adminappmiddleware.app.getallpartnersubscription(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
    });
}

export const getpartnersubscriptionbyid = async(req, res) => {
    Adminappmiddleware.app.getpartnersubscriptionbyid(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
    });
}

export const addpartnersubscription = async(req, res) => {
    Adminappmiddleware.app.addpartnersubscription(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        }
        )
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
    });
}

export const updatepartnersubscription = async(req, res) => {
    Adminappmiddleware.app.updatepartnersubscription(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
    });
}

export const getallpartnersubscriptionfeatures = async(req, res) => {
    Adminappmiddleware.app.getallpartnersubscriptionfeatures(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
    });
}

export const deletepartnersubscription = async(req, res) => {
    Adminappmiddleware.app.deletepartnersubscription(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
    });
}

export const updateservicecategoryimage = async(req, res) => {
    Adminappmiddleware.app.updateservicecategoryimage(req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
}

const holidayHandler = (method) => async (req, res) => {
    Adminappmiddleware.app[method](req)
        .then((data) => {
            const response = ApplicationResult.forCreated();
            var statuscode = 0;
            ApplicationResponse.success(
                response,
                null,
                (response) => (statuscode = response.status)
            );
            res.json({ status: statuscode, data: data });
        })
        .catch((error) => {
            ApplicationResponse.error(error, null, (response) => {
                res.status(response.status).json(response);
            });
        });
};

export const listStoreHolidays = holidayHandler("listStoreHolidays");
export const addStoreHoliday = holidayHandler("addStoreHoliday");
export const removeStoreHoliday = holidayHandler("removeStoreHoliday");
export const addWeeklyHoliday = holidayHandler("addWeeklyHoliday");
export const removeWeeklyHoliday = holidayHandler("removeWeeklyHoliday");
