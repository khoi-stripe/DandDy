import Foundation

class CampaignService {
    static let shared = CampaignService()
    private init() {}
    
    private let apiClient = APIClient.shared
    
    func createCampaign(name: String, description: String?) async throws -> Campaign {
        let campaignData = CampaignCreate(name: name, description: description)
        let campaign: Campaign = try await apiClient.request(
            endpoint: "/campaigns/",
            method: "POST",
            body: campaignData
        )
        return campaign
    }
    
    func getCampaigns() async throws -> [Campaign] {
        let campaigns: [Campaign] = try await apiClient.request(endpoint: "/campaigns/")
        return campaigns
    }
    
    func getCampaign(id: Int) async throws -> CampaignWithCharacters {
        let campaign: CampaignWithCharacters = try await apiClient.request(endpoint: "/campaigns/\(id)")
        return campaign
    }
    
    func deleteCampaign(id: Int) async throws {
        try await apiClient.requestNoResponse(
            endpoint: "/campaigns/\(id)",
            method: "DELETE"
        )
    }
}


