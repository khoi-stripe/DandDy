import Foundation
import SwiftUI

@MainActor
class CharacterViewModel: ObservableObject {
    @Published var characters: [Character] = []
    @Published var selectedCharacter: Character?
    @Published var isLoading = false
    @Published var errorMessage: String?
    
    private let characterService = CharacterService.shared
    
    func loadCharacters() async {
        isLoading = true
        errorMessage = nil
        
        do {
            characters = try await characterService.getCharacters()
        } catch {
            errorMessage = error.localizedDescription
        }
        
        isLoading = false
    }
    
    func loadCharacter(id: Int) async {
        isLoading = true
        errorMessage = nil
        
        do {
            selectedCharacter = try await characterService.getCharacter(id: id)
        } catch {
            errorMessage = error.localizedDescription
        }
        
        isLoading = false
    }
    
    func createCharacter(_ character: CharacterCreate) async -> Bool {
        isLoading = true
        errorMessage = nil
        
        do {
            let newCharacter = try await characterService.createCharacter(character)
            characters.append(newCharacter)
            isLoading = false
            return true
        } catch {
            errorMessage = error.localizedDescription
            isLoading = false
            return false
        }
    }
    
    func updateCharacter(id: Int, updates: [String: Any]) async {
        isLoading = true
        errorMessage = nil
        
        do {
            let updatedCharacter = try await characterService.updateCharacter(id: id, updates: updates)
            if let index = characters.firstIndex(where: { $0.id == id }) {
                characters[index] = updatedCharacter
            }
            if selectedCharacter?.id == id {
                selectedCharacter = updatedCharacter
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        
        isLoading = false
    }
    
    func deleteCharacter(id: Int) async {
        isLoading = true
        errorMessage = nil
        
        do {
            try await characterService.deleteCharacter(id: id)
            characters.removeAll { $0.id == id }
            if selectedCharacter?.id == id {
                selectedCharacter = nil
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        
        isLoading = false
    }
    
    // Helper functions for character stats
    func abilityModifier(_ score: Int) -> Int {
        return DiceRoller.calculateModifier(score)
    }
    
    func proficiencyBonus(level: Int) -> Int {
        return 2 + (level - 1) / 4
    }
}


