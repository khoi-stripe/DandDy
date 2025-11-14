import SwiftUI

@main
struct DandDy_macOSApp: App {
    @StateObject private var authViewModel = AuthViewModel()
    
    var body: some Scene {
        WindowGroup {
            MacContentView()
                .environmentObject(authViewModel)
                .frame(minWidth: 900, minHeight: 600)
        }
        .commands {
            // Custom menu commands
            CommandGroup(replacing: .newItem) {
                Button("New Character") {
                    NotificationCenter.default.post(name: .newCharacter, object: nil)
                }
                .keyboardShortcut("n", modifiers: .command)
            }
            
            CommandGroup(after: .newItem) {
                Button("New Campaign") {
                    NotificationCenter.default.post(name: .newCampaign, object: nil)
                }
                .keyboardShortcut("n", modifiers: [.command, .shift])
                .disabled(authViewModel.currentUser?.role != .dm)
            }
            
            CommandMenu("Character") {
                Button("Roll Dice") {
                    NotificationCenter.default.post(name: .rollDice, object: nil)
                }
                .keyboardShortcut("d", modifiers: .command)
                
                Divider()
                
                Button("Take Damage") {
                    NotificationCenter.default.post(name: .takeDamage, object: nil)
                }
                .keyboardShortcut("h", modifiers: [.command, .shift])
                
                Button("Heal") {
                    NotificationCenter.default.post(name: .heal, object: nil)
                }
                .keyboardShortcut("h", modifiers: .command)
            }
        }
        
        Settings {
            SettingsView()
                .environmentObject(authViewModel)
        }
    }
}

// Notification names for menu commands
extension Notification.Name {
    static let newCharacter = Notification.Name("newCharacter")
    static let newCampaign = Notification.Name("newCampaign")
    static let rollDice = Notification.Name("rollDice")
    static let takeDamage = Notification.Name("takeDamage")
    static let heal = Notification.Name("heal")
}


