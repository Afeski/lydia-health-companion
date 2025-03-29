import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { 
  Card, 
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle 
} from "@/components/ui/card";
import {
  Calendar,
  Clock,
  MessageSquare,
  Plus,
  User,
  Bell,
  Settings,
  LogOut,
  ThermometerSnowflake,
  CalendarCheck,
  Pill,
  ChevronRight,
  Search,
  MapPin,
  Video,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import AudioWaveformComponent from "@/components/AudioWaveform";
import SymptomChecker from "@/components/SymptomChecker";
import AppointmentManager from "@/components/AppointmentManager";
import { supabase } from "@/integrations/supabase/client";
import MicrophoneWithWaves from "@/components/MicrophoneWithWaves";
import DoctorDetail from "@/components/DoctorDetail";

const userData = {
  name: "John Doe",
  upcomingAppointments: [
    { 
      id: 1, 
      doctor: "Dr. Sarah Johnson", 
      specialty: "Cardiologist", 
      date: "May 15, 2023", 
      time: "10:00 AM",
      appointmentType: "virtual",
      bio: "Dr. Sarah Johnson is a board-certified cardiologist with over 15 years of experience in treating heart conditions. She specializes in preventive cardiology and heart disease management.",
      patientCase: "Follow-up appointment for recent blood pressure concerns and medication adjustment."
    },
    { 
      id: 2, 
      doctor: "Dr. Michael Chen", 
      specialty: "Primary Care", 
      date: "June 2, 2023", 
      time: "2:30 PM",
      appointmentType: "in-person",
      location: "Downtown Medical Clinic",
      bio: "Dr. Michael Chen is a family medicine physician dedicated to providing comprehensive healthcare for patients of all ages. He focuses on preventive care and managing chronic conditions.",
      patientCase: "Annual physical examination and routine health screening."
    },
    { 
      id: 3, 
      doctor: "Dr. Emily Rodriguez", 
      specialty: "Dermatologist", 
      date: "June 10, 2023", 
      time: "11:15 AM",
      appointmentType: "virtual",
      bio: "Dr. Emily Rodriguez is a dermatologist specializing in both medical and cosmetic dermatology. She has particular expertise in treating skin conditions like eczema, psoriasis, and acne.",
      patientCase: "Follow-up on recent skin rash and evaluation of treatment effectiveness."
    }
  ],
  medications: [
    { id: 1, name: "Lisinopril", dosage: "10mg", frequency: "Once daily", time: "8:00 AM", nextDose: "Today" },
    { id: 2, name: "Metformin", dosage: "500mg", frequency: "Twice daily", time: "8:00 AM / 8:00 PM", nextDose: "Today" },
    { id: 3, name: "Atorvastatin", dosage: "20mg", frequency: "Once daily", time: "8:00 PM", nextDose: "Today" }
  ]
};

const formatTime = () => {
  const now = new Date();
  let hours = now.getHours();
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // Handle midnight (0 hours)
  return `${hours}:${minutes} ${ampm}`;
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [activeChat, setActiveChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [messages, setMessages] = useState([
    { id: 1, sender: "system", text: "Hello! I'm Lydia, your AI health assistant. How can I help you today?", time: formatTime() }
  ]);
  const [userInput, setUserInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isAIProcessing, setIsAIProcessing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [showSymptomChecker, setShowSymptomChecker] = useState(false);
  const [showAppointmentManager, setShowAppointmentManager] = useState(false);
  const [appointments, setAppointments] = useState(userData.upcomingAppointments);
  const [selectedDoctor, setSelectedDoctor] = useState<any>(null);
  const [showDoctorDetail, setShowDoctorDetail] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleLogout = async () => {
    try {
      await signOut();
      toast({
        title: "Logged out",
        description: "You have been successfully logged out",
      });
      navigate("/");
    } catch (error) {
      console.error("Logout error:", error);
      toast({
        title: "Error",
        description: "Failed to log out. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim() && !isRecording) return;
    
    const newUserMessage = {
      id: messages.length + 1,
      sender: "user",
      text: userInput,
      time: formatTime()
    };
    
    setMessages(prev => [...prev, newUserMessage]);
    setUserInput("");
    
    setIsAIProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("chat", {
        body: { message: userInput }
      });
      
      if (error) {
        console.error("Chat error from Supabase:", error);
        throw new Error("Failed to get AI response");
      }
      
      const aiResponse = {
        id: messages.length + 2,
        sender: "system",
        text: data.response || "I can help you with that! Would you like me to check your symptoms or schedule an appointment with a doctor?",
        time: formatTime()
      };
      
      setMessages(prev => [...prev, aiResponse]);
      
      await convertToSpeech(aiResponse.text);
    } catch (error) {
      console.error("Error processing message:", error);
      toast({
        title: "Error",
        description: "Failed to process your message. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsAIProcessing(false);
    }
  };

  const toggleVoiceConversation = async () => {
    if (isRecording) {
      stopRecording();
    } else {
      await startRecording();
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          try {
            const base64Audio = reader.result?.toString().split(',')[1] || '';
            
            setIsListening(false);
            setIsAIProcessing(true);
            
            console.log("Sending audio data to transcribe function");
            const { data, error } = await supabase.functions.invoke("transcribe", {
              body: { audio: base64Audio }
            });
            
            if (error) {
              console.error("Transcription error from Supabase:", error);
              throw new Error("Failed to transcribe audio");
            }
            
            console.log("Received transcription:", data);
            if (!data || !data.text) {
              throw new Error("No transcription text received");
            }
            
            setUserInput(data.text);
            
            setTimeout(() => {
              const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
              handleSendMessage(fakeEvent);
            }, 500);
          } catch (error) {
            console.error("Transcription error:", error);
            toast({
              title: "Transcription error",
              description: "Could not understand audio. Please try again.",
              variant: "destructive"
            });
            setIsAIProcessing(false);
          }
        };
        
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorder.start();
      setIsRecording(true);
      setIsListening(true);
      
      toast({
        title: "Listening",
        description: "Lydia is listening. Speak clearly and I'll respond.",
      });
    } catch (error) {
      console.error("Recording error:", error);
      toast({
        title: "Microphone error",
        description: "Could not access your microphone. Please check permissions.",
        variant: "destructive"
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const convertToSpeech = async (text: string) => {
    try {
      setIsSpeaking(true);
      console.log("Sending text to eleven-labs-voice:", text.substring(0, 30) + "...");
      
      const { data, error } = await supabase.functions.invoke("eleven-labs-voice", {
        body: { 
          message: text,
          voice_id: "EXAVITQu4vr4xnSDxMaL" 
        }
      });
      
      if (error) {
        console.error("Eleven Labs error:", error);
        throw new Error("Failed to convert text to speech");
      }
      
      if (!data || !data.audio) {
        console.error("No audio data received from Eleven Labs");
        throw new Error("No audio data received");
      }
      
      const audioContent = data.audio;
      console.log("Audio received, length:", audioContent.length);
      
      const audio = new Audio(`data:audio/mpeg;base64,${audioContent}`);
      audio.onended = () => setIsSpeaking(false);
      audio.onerror = (e) => {
        console.error("Audio playback error:", e);
        setIsSpeaking(false);
      };
      await audio.play();
    } catch (error) {
      console.error("Text-to-speech error:", error);
      toast({
        title: "Voice error",
        description: "Could not convert text to speech. Using text only.",
        variant: "destructive"
      });
      setIsSpeaking(false);
    }
  };

  const startSymptomAssessment = () => {
    setShowSymptomChecker(true);
  };

  const scheduleAppointment = () => {
    setShowAppointmentManager(true);
  };

  const handleNewAppointment = (appointment: any) => {
    setAppointments(prev => [appointment, ...prev]);
  };

  const openDoctorDetail = (doctor: any) => {
    setSelectedDoctor(doctor);
    setShowDoctorDetail(true);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#301A4B] text-white">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">Lydia</h1>
          
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
              <Bell className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
              <Settings className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={handleLogout}>
              <LogOut className="h-5 w-5" />
            </Button>
            <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-medium">
              JD
            </div>
          </div>
        </div>
      </header>

      <div className="dashboard-container grid grid-cols-1 lg:grid-cols-3 gap-6 py-6 px-4">
        <div className="lg:col-span-1 space-y-6">
          <Card className="animate-fade-in">
            <CardHeader className="pb-2">
              <CardTitle className="text-xl">Welcome back, {userData.name}</CardTitle>
              <CardDescription>Here's your health summary</CardDescription>
            </CardHeader>
            
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-[#CB48B7]/10 rounded-lg">
                  <Calendar className="h-5 w-5 text-[#CB48B7]" />
                  <div>
                    <p className="text-sm font-medium">Next appointment</p>
                    <p className="text-xs text-gray-500">{appointments[0]?.date} at {appointments[0]?.time}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 p-3 bg-[#CB48B7]/10 rounded-lg">
                  <Clock className="h-5 w-5 text-[#CB48B7]" />
                  <div>
                    <p className="text-sm font-medium">Medication reminder</p>
                    <p className="text-xs text-gray-500">Next: {userData.medications[0].name} at {userData.medications[0].time}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="animate-fade-in" style={{ animationDelay: "0.1s" }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xl">Quick Actions</CardTitle>
            </CardHeader>
            
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <Button 
                  variant="outline" 
                  className="h-auto flex-col items-center justify-center py-6 hover:bg-[#CB48B7]/10 hover:text-[#301A4B] hover:border-[#CB48B7]"
                  onClick={startSymptomAssessment}
                >
                  <ThermometerSnowflake className="h-6 w-6 mb-2" />
                  <span className="text-sm">Check Symptoms</span>
                </Button>
                
                <Button 
                  variant="outline" 
                  className="h-auto flex-col items-center justify-center py-6 hover:bg-[#CB48B7]/10 hover:text-[#301A4B] hover:border-[#CB48B7]"
                  onClick={scheduleAppointment}
                >
                  <CalendarCheck className="h-6 w-6 mb-2" />
                  <span className="text-sm">Schedule Visit</span>
                </Button>
                
                <Button 
                  variant="outline" 
                  className="h-auto flex-col items-center justify-center py-6 hover:bg-[#CB48B7]/10 hover:text-[#301A4B] hover:border-[#CB48B7]"
                >
                  <Pill className="h-6 w-6 mb-2" />
                  <span className="text-sm">My Medications</span>
                </Button>
                
                <Button 
                  variant="outline" 
                  className="h-auto flex-col items-center justify-center py-6 hover:bg-[#CB48B7]/10 hover:text-[#301A4B] hover:border-[#CB48B7]"
                >
                  <User className="h-6 w-6 mb-2" />
                  <span className="text-sm">My Profile</span>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="animate-fade-in shadow-md border-[#CB48B7]/10" style={{ animationDelay: "0.2s" }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xl flex items-center">
                <CalendarCheck className="mr-2 h-5 w-5 text-[#CB48B7]" />
                Upcoming Appointments
              </CardTitle>
            </CardHeader>
            
            <CardContent>
              <div className="space-y-3">
                {appointments.map((appointment) => (
                  <button
                    key={appointment.id}
                    className="w-full p-3 border rounded-lg hover:border-[#CB48B7] hover:shadow-md transition-all cursor-pointer bg-white"
                    onClick={() => openDoctorDetail(appointment)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#E6E6FA] flex items-center justify-center shrink-0 text-[#301A4B]">
                          <User className="h-5 w-5" />
                        </div>
                        <div className="text-left">
                          <p className="font-medium text-[#301A4B]">{appointment.doctor}</p>
                          <p className="text-sm text-gray-500">{appointment.specialty}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                        <div className="px-2 py-1 rounded-full text-xs font-medium mb-1"
                          style={{
                            backgroundColor: appointment.appointmentType === 'virtual' ? '#e0f2fe' : '#f0fdf4',
                            color: appointment.appointmentType === 'virtual' ? '#0369a1' : '#15803d'
                          }}
                        >
                          {appointment.appointmentType === 'virtual' ? 'Virtual' : 'In-Person'}
                        </div>
                        <ChevronRight className="h-5 w-5 text-gray-400" />
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-sm text-gray-500">
                      <div className="flex items-center">
                        <Calendar className="h-4 w-4 mr-1" />
                        <span>{appointment.date}</span>
                      </div>
                      <div className="flex items-center">
                        <Clock className="h-4 w-4 mr-1" />
                        <span>{appointment.time}</span>
                      </div>
                      <div className="flex items-center">
                        {appointment.appointmentType === 'virtual' ? (
                          <Video className="h-4 w-4 mr-1" />
                        ) : (
                          <MapPin className="h-4 w-4 mr-1" />
                        )}
                        <span>{appointment.appointmentType === 'virtual' ? 'Video Call' : appointment.location}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
            
            <CardFooter className="pt-2">
              <Button 
                variant="outline" 
                className="w-full text-[#301A4B] border-[#CB48B7]/30 hover:bg-[#CB48B7]/5"
                onClick={scheduleAppointment}
              >
                <Plus className="mr-2 h-4 w-4" /> Schedule New Appointment
              </Button>
            </CardFooter>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card className="h-[calc(100vh-150px)] flex flex-col animate-scale-in">
            <CardHeader className="pb-2 border-b">
              <CardTitle className="text-xl flex items-center">
                <div className="w-8 h-8 rounded-full bg-[#CB48B7]/20 flex items-center justify-center mr-2">
                  <MessageSquare className="h-4 w-4 text-[#CB48B7]" />
                </div>
                Chat with Lydia
              </CardTitle>
              <CardDescription>Your AI health assistant</CardDescription>
            </CardHeader>
            
            <CardContent className="flex-grow overflow-y-auto pt-4">
              <div className="space-y-4">
                {messages.map((message) => (
                  <div 
                    key={message.id} 
                    className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div 
                      className={`max-w-[80%] p-3 rounded-lg ${
                        message.sender === 'user' 
                          ? 'bg-[#301A4B] text-white rounded-tr-none' 
                          : 'bg-gray-100 text-gray-800 rounded-tl-none'
                      }`}
                    >
                      <p>{message.text}</p>
                      <p className={`text-xs mt-1 ${message.sender === 'user' ? 'text-white/70' : 'text-gray-500'}`}>
                        {message.time}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </CardContent>
            
            <CardFooter className="border-t p-3">
              <form onSubmit={handleSendMessage} className="w-full flex gap-2">
                <div className="relative flex-grow">
                  <input
                    type="text"
                    placeholder={isListening ? "Listening..." : "Type your message..."}
                    className="w-full p-3 pr-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#CB48B7] focus:border-transparent"
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    disabled={isRecording || isAIProcessing}
                  />
                  <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                </div>
                
                <Button 
                  type="button" 
                  variant="outline"
                  onClick={toggleVoiceConversation}
                  className={`${
                    isRecording 
                      ? 'bg-red-100 text-red-600 border-red-300' 
                      : isSpeaking 
                        ? 'bg-purple-100 text-purple-600 border-purple-300'
                        : ''
                  } relative`}
                  disabled={isAIProcessing}
                >
                  <MicrophoneWithWaves 
                    isRecording={isRecording} 
                    isSpeaking={isSpeaking} 
                  />
                </Button>
                
                <Button 
                  type="submit" 
                  className="bg-[#301A4B] hover:bg-[#301A4B]/90"
                  disabled={isRecording || isAIProcessing || isSpeaking || (!userInput.trim() && !isRecording)}
                >
                  Send
                </Button>
              </form>
            </CardFooter>
          </Card>
        </div>
      </div>

      <SymptomChecker 
        open={showSymptomChecker} 
        onOpenChange={setShowSymptomChecker} 
      />
      
      <AppointmentManager 
        open={showAppointmentManager} 
        onOpenChange={setShowAppointmentManager} 
        onAppointmentBooked={handleNewAppointment}
      />

      {selectedDoctor && (
        <DoctorDetail
          open={showDoctorDetail}
          onOpenChange={setShowDoctorDetail}
          doctor={selectedDoctor}
        />
      )}
    </div>
  );
};

export default Dashboard;
