import Foundation
import SwiftUI

@MainActor
class CampaignViewModel: ObservableObject {
    @Published var campaigns: [Campaign] = []
    @Published var selectedCampaign: CampaignWithCharacters?
    @Published var isLoading = false
    @Published var errorMessage: String?
    
    private let campaignService = CampaignService.shared
    
    func loadCampaigns() async {
        isLoading = true
        errorMessage = nil
        
        do {
            campaigns = try await campaignService.getCampaigns()
        } catch {
            errorMessage = error.localizedDescription
        }
        
        isLoading = false
    }
    
    func loadCampaign(id: Int) async {
        isLoading = true
        errorMessage = nil
        
        do {
            selectedCampaign = try await campaignService.getCampaign(id: id)
        } catch {
            errorMessage = error.localizedDescription
        }
        
        isLoading = false
    }
    
    func createCampaign(name: String, description: String?) async -> Bool {
        isLoading = true
        errorMessage = nil
        
        do {
            let campaign = try await campaignService.createCampaign(name: name, description: description)
            campaigns.append(campaign)
            isLoading = false
            return true
        } catch {
            errorMessage = error.localizedDescription
            isLoading = false
            return false
        }
    }
    
    func deleteCampaign(id: Int) async {
        isLoading = true
        errorMessage = nil
        
        do {
            try await campaignService.deleteCampaign(id: id)
            campaigns.removeAll { $0.id == id }
            if selectedCampaign?.id == id {
                selectedCampaign = nil
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        
        isLoading = false
    }
}


